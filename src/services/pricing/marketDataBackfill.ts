/**
 * Pipeline de materialização de dados de mercado por símbolo + drenagem da fila
 * de gaps. Separado de `marketDataGap.ts` porque IMPORTA o `dividendService`
 * (BRAPI) e o `yahooCorporateActions` (Yahoo) — manter a busca aqui evita ciclo
 * com o dividendService, que importa só `recordGap` dos helpers puros.
 *
 * Ordem por símbolo (a mesma de `ensureCorporateActionsSynced`): BRAPI primeiro
 * (dividendos recentes + bonificações), depois Yahoo splits, e por último Yahoo
 * dividendos antigos — que des-ajustam pelo `cumFactor` dos splits e portanto
 * dependem deles já estarem no banco.
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { refreshDividendsFromBrapi } from '@/services/pricing/dividendService';
import {
  fetchYahooSplits,
  persistYahooSplits,
  syncYahooDividends,
} from '@/services/pricing/yahooCorporateActions';
import { recordCoverage, type CoverageStatus } from '@/services/pricing/marketDataGap';
import { dedupSymbolCorporateActions } from '@/services/pricing/corporateActionsDedup';
import { removeSpuriousForSymbol } from '@/services/pricing/corporateActionValidation';

export interface SymbolBackfillResult {
  symbol: string;
  status: CoverageStatus;
  dividendCount: number;
  caCount: number;
  error: string | null;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Retry com backoff exponencial — cobre 429/timeout esporádico das fontes. */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < tries - 1) await sleep(1000 * 2 ** i); // 1s, 2s
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Materializa dividendos + eventos corporativos de UM símbolo no banco e grava o
 * status em `MarketDataCoverage`. Distingue EMPTY (fonte buscada com sucesso, mas
 * sem provento/evento) de FETCH_FAIL (não conseguiu buscar — retry depois) usando
 * o fetch CRU do Yahoo (que lança em erro de rede), não só a contagem final.
 */
export const backfillSymbolMarketData = async (symbol: string): Promise<SymbolBackfillResult> => {
  const sym = symbol.trim().toUpperCase();

  // 1) BRAPI é a fonte PRINCIPAL (chave paga): puxa o histórico COMPLETO de
  // dividendos (força refresh, não banco-primeiro → preenche buracos antigos) +
  // bonificações. Retorna quantos dividendos a BRAPI cobre.
  let brapiThrew = false;
  let brapiDivCount = 0;
  try {
    brapiDivCount = await withRetry(() => refreshDividendsFromBrapi(sym));
  } catch (err) {
    brapiThrew = true;
    logger.warn(`[market-backfill] BRAPI falhou para ${sym} (não-fatal):`, err);
  }

  // 2) Splits/grupamentos via Yahoo. Fetch CRU pra detectar reachability — se
  // lançar, a fonte está fora (FETCH_FAIL).
  let yahooReachable = false;
  let yahooErr: string | null = null;
  try {
    const splits = await withRetry(() => fetchYahooSplits(sym));
    await persistYahooSplits(sym, splits);
    yahooReachable = true;
  } catch (err) {
    yahooErr = err instanceof Error ? err.message : String(err);
    logger.warn(`[market-backfill] Yahoo splits falhou para ${sym} (não-fatal):`, err);
  }

  // 3) Yahoo dividendos só como FALLBACK: quando a BRAPI não cobre o símbolo
  // (brapiDivCount === 0). Se a BRAPI trouxe dividendos, ela é canônica.
  if (yahooReachable && brapiDivCount === 0) {
    await syncYahooDividends(sym);
  }

  // 3b) Dedup: a BRAPI grava o mesmo split como BONIFICACAO e o Yahoo como
  // DESDOBRAMENTO (datas/tipos diferentes) → fator dobrado. Colapsa, mantendo o
  // Yahoo canônico. Roda DEPOIS de ambos. Preserva eventos BRAPI órfãos.
  await dedupSymbolCorporateActions(sym);

  // 3c) Anti-espúrio: os feeds têm splits/grupamentos FALSOS (sobretudo FII) que
  // inflam a posição. Confere cada evento contra o salto de preço real e remove
  // os que não aconteceram. Depende do histórico de preço já estar no banco.
  await removeSpuriousForSymbol(sym);

  // 4) Conta o que de fato ficou no banco e classifica.
  const [dividendCount, caCount] = await Promise.all([
    prisma.assetDividendHistory.count({ where: { symbol: sym } }),
    prisma.assetCorporateAction.count({ where: { symbol: sym } }),
  ]);

  const total = dividendCount + caCount;
  const fetchFailed = brapiThrew || !yahooReachable;
  const status: CoverageStatus = total > 0 ? 'OK' : fetchFailed ? 'FETCH_FAIL' : 'EMPTY';

  const error =
    status === 'FETCH_FAIL'
      ? [brapiThrew ? 'BRAPI falhou' : null, yahooErr ? `Yahoo: ${yahooErr}` : null]
          .filter(Boolean)
          .join('; ')
      : null;

  await recordCoverage(sym, { status, dividendCount, caCount, error });
  return { symbol: sym, status, dividendCount, caCount, error };
};

export interface RefreshCycleResult {
  processed: number;
  ok: number;
  empty: number;
  failed: number;
  gapsTargeted: number;
  staleTargeted: number;
}

/**
 * Um ciclo do cron de refresh, dentro de um orçamento de tempo (Vercel 60s).
 * Prioriza a FILA de gaps (símbolos novos/falhos — GAP_QUEUED/FETCH_FAIL), depois
 * refresca os já cobertos mais ANTIGOS (cursor por `lastCheckedAt`). Em N execuções
 * agendadas, percorre o catálogo inteiro sem nunca estourar o deadline. Mantém o
 * banco fresco SEM o caminho de request depender de fonte externa.
 */
export const runRefreshCycle = async (opts?: {
  maxSymbols?: number;
  throttleMs?: number;
  deadlineMs?: number;
}): Promise<RefreshCycleResult> => {
  const maxSymbols = opts?.maxSymbols ?? 60;
  const throttleMs = opts?.throttleMs ?? 250;
  const deadline = Date.now() + (opts?.deadlineMs ?? 50_000);

  const gaps = await prisma.marketDataCoverage.findMany({
    where: { status: { in: ['GAP_QUEUED', 'FETCH_FAIL'] } },
    orderBy: [{ gapRequestedAt: 'asc' }, { lastCheckedAt: 'asc' }],
    take: maxSymbols,
    select: { symbol: true },
  });
  const remaining = maxSymbols - gaps.length;
  const stale =
    remaining > 0
      ? await prisma.marketDataCoverage.findMany({
          where: { status: { in: ['OK', 'EMPTY'] } },
          orderBy: { lastCheckedAt: 'asc' },
          take: remaining,
          select: { symbol: true },
        })
      : [];

  const queue = [...gaps, ...stale];
  const res: RefreshCycleResult = {
    processed: 0,
    ok: 0,
    empty: 0,
    failed: 0,
    gapsTargeted: gaps.length,
    staleTargeted: stale.length,
  };
  for (let i = 0; i < queue.length; i++) {
    if (Date.now() > deadline) break;
    const r = await backfillSymbolMarketData(queue[i].symbol);
    res.processed++;
    if (r.status === 'OK') res.ok++;
    else if (r.status === 'EMPTY') res.empty++;
    else res.failed++;
    if (i < queue.length - 1 && throttleMs > 0) await sleep(throttleMs);
  }
  return res;
};
