/**
 * Cobertura de dados de mercado por símbolo (`MarketDataCoverage`).
 *
 * O runtime lê dividendos/eventos corporativos SÓ do banco (sem fallback externo
 * no caminho de request). Quando um símbolo falta, em vez de buscar inline e
 * bloquear o usuário, registra-se um GAP aqui — o backfill background (cron de
 * refresh + `drainGaps`) o resolve depois. Esta é a "rede de alarme".
 *
 * A mesma tabela serve de:
 *  - registro de status do backfill por símbolo (OK / EMPTY / FETCH_FAIL);
 *  - checkpoint de resumabilidade (`lastCheckedAt`) pro orquestrador em lotes;
 *  - fila de gaps de runtime (`status='GAP_QUEUED'`, `gapRequestedAt`).
 *
 * Helpers puros: dependem só de prisma + logger, então `dividendService` pode
 * importar `recordGap` sem ciclo. O pipeline que de fato busca os dados vive em
 * `marketDataBackfill.ts` (que importa este + o dividendService).
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export type CoverageStatus = 'OK' | 'EMPTY' | 'FETCH_FAIL' | 'GAP_QUEUED';
export type CoverageSource = 'backfill' | 'runtime-gap' | 'catalog-hook' | 'add-flow';

/** Tipos de renda variável cujos proventos/eventos pré-carregamos no banco. */
export const COVERAGE_RV_TYPES = ['stock', 'fii', 'etf', 'reit', 'fim-fia', 'bdr'];

const normalizeSymbol = (symbol: string): string => symbol.trim().toUpperCase();

/**
 * Registra que um símbolo faltou no banco em runtime (ou foi recém-catalogado),
 * enfileirando-o pro backfill. Best-effort: NUNCA lança — não pode derrubar o
 * request do usuário. Não sobrescreve um registro já OK/EMPTY recente: só marca
 * GAP_QUEUED se o símbolo ainda não tem cobertura confirmada.
 */
export const recordGap = async (symbol: string, source: CoverageSource): Promise<void> => {
  if (!symbol?.trim()) return;
  const sym = normalizeSymbol(symbol);
  try {
    const existing = await prisma.marketDataCoverage.findUnique({
      where: { symbol: sym },
      select: { status: true },
    });
    // Já tem dados confirmados → não re-enfileira (evita ruído e re-fetch à toa).
    if (existing && (existing.status === 'OK' || existing.status === 'EMPTY')) return;

    await prisma.marketDataCoverage.upsert({
      where: { symbol: sym },
      update: { status: 'GAP_QUEUED', gapRequestedAt: new Date(), source },
      create: { symbol: sym, status: 'GAP_QUEUED', gapRequestedAt: new Date(), source },
    });
    logger.warn(
      `[market-gap] símbolo ${sym} ausente no banco (${source}) — enfileirado p/ backfill`,
    );
  } catch (err) {
    logger.warn(`[market-gap] falha ao registrar gap de ${sym} (não-fatal):`, err);
  }
};

/**
 * Atualiza a cobertura de um símbolo após o backfill processá-lo. Usado pelo
 * orquestrador (`backfill-market-data.ts`) e pelo `drainGaps`.
 */
export const recordCoverage = async (
  symbol: string,
  data: { status: CoverageStatus; dividendCount: number; caCount: number; error?: string | null },
): Promise<void> => {
  if (!symbol?.trim()) return;
  const sym = normalizeSymbol(symbol);
  const now = new Date();
  try {
    await prisma.marketDataCoverage.upsert({
      where: { symbol: sym },
      update: {
        status: data.status,
        dividendCount: data.dividendCount,
        caCount: data.caCount,
        lastCheckedAt: now,
        lastError: data.error ?? null,
        // limpa a marca de gap quando resolvido com sucesso
        gapRequestedAt: data.status === 'OK' || data.status === 'EMPTY' ? null : undefined,
      },
      create: {
        symbol: sym,
        status: data.status,
        dividendCount: data.dividendCount,
        caCount: data.caCount,
        lastCheckedAt: now,
        lastError: data.error ?? null,
        source: 'backfill',
      },
    });
  } catch (err) {
    logger.warn(`[market-gap] falha ao gravar cobertura de ${sym} (não-fatal):`, err);
  }
};

/**
 * Hook de catálogo: enfileira todo símbolo RV do catálogo (`Asset`) que ainda não
 * tem linha de cobertura — i.e., recém-adicionado pelos crons de catálogo. Roda no
 * fim de `brapi-sync/catalog` e `cvm-catalog-sync`, garantindo que ativo novo seja
 * coberto pelo backfill background SEM o usuário precisar esbarrar nele. Insert em
 * lote (`createMany skipDuplicates`) — barato, cabe no orçamento de 60s do cron.
 * Retorna quantos símbolos foram enfileirados.
 */
export const enqueueUncoveredCatalogSymbols = async (): Promise<number> => {
  try {
    const [assets, covered] = await Promise.all([
      prisma.asset.findMany({
        where: { type: { in: COVERAGE_RV_TYPES } },
        select: { symbol: true },
        distinct: ['symbol'],
      }),
      prisma.marketDataCoverage.findMany({ select: { symbol: true } }),
    ]);
    const have = new Set(covered.map((c) => c.symbol));
    const missing = assets.map((a) => a.symbol).filter((s) => !have.has(s));
    if (missing.length === 0) return 0;

    const now = new Date();
    await prisma.marketDataCoverage.createMany({
      data: missing.map((symbol) => ({
        symbol: normalizeSymbol(symbol),
        status: 'GAP_QUEUED',
        gapRequestedAt: now,
        source: 'catalog-hook' as CoverageSource,
      })),
      skipDuplicates: true,
    });
    logger.warn(`[market-gap] ${missing.length} símbolo(s) novo(s) do catálogo enfileirado(s)`);
    return missing.length;
  } catch (err) {
    logger.warn('[market-gap] falha ao enfileirar símbolos do catálogo (não-fatal):', err);
    return 0;
  }
};
