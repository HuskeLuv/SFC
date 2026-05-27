/**
 * F2.4 — Sync de cotações históricas de criptoativos via API pública do CoinGecko.
 *
 * Cobre o gap em AssetPriceHistory pra cripto, que hoje tem ~1.8 anos de histórico
 * (2024-07 → hoje, via BRAPI). Em modo público gratuito conseguimos densificar
 * o último ano com pontos diários USD; 10 anos só com chave paga (CoinGecko
 * Analyst/Pro). Ver nota de "Limites do free tier" abaixo.
 *
 * Endpoint:
 *   GET https://api.coingecko.com/api/v3/coins/{coinId}/market_chart
 *       ?vs_currency=usd&days={days}
 *
 * Resposta:
 *   { prices: [[timestamp_ms, price_usd], ...], market_caps: [...], total_volumes: [...] }
 *
 * Limites do free tier (verificado 2026-05-27 via curl):
 *   • Histórico restrito aos últimos 365 dias. days>365 ou days=max retornam
 *     HTTP 401 com error_code 10012 ("Your request exceeds the allowed time range.
 *     Public API users are limited to querying historical data within the past
 *     365 days. Upgrade to a paid plan...").
 *   • Rate limit observado: ~10-30 req/min sem chave.
 *   • Pra 10 anos é necessária chave Analyst/Pro (a partir de US$ 129/mês) ou
 *     fonte alternativa (Binance klines, Yahoo Finance, etc).
 *
 * Decisões:
 *   • Cotação armazenada em USD (currency='USD'), alinhado com Asset.currency das
 *     criptos no catálogo (BRAPI define type==='crypto' → currency='USD' no
 *     brapiSync.determineCurrency). O front converte ao exibir usando USD-BRL
 *     histórico. Sync diária BRAPI atualmente persiste em BRL — gera uma
 *     "fronteira" no histórico (BRL pré-F2.4 vs USD pós-F2.4) que será
 *     reconciliada quando USD-BRL histórico (F2.3) ficar disponível.
 *
 * Rate limit:
 *   Mantemos sleep de 6s entre chamadas (~10 req/min efetivo) pra ser gentil
 *   no free tier (em teste com 2s caímos em HTTP 429). Pra ~10 cripto isso
 *   são ~1min de overhead.
 *
 * Idempotente: usa unique constraint [symbol, date] do AssetPriceHistory via
 * createMany + skipDuplicates.
 */
import { logger } from '@/lib/logger';
import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import prisma from '@/lib/prisma';

// ================== CONSTANTS ==================

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

/** Fonte gravada em AssetPriceHistory pra distinguir de BRAPI/B3/CVM/Tesouro. */
const SOURCE = 'COINGECKO';

/** Moeda alvo da cotação retornada pela API. */
const VS_CURRENCY = 'usd';

/** Currency persistido no AssetPriceHistory (uppercased). */
const PERSIST_CURRENCY = 'USD';

/** Tamanho de batch pro createMany dentro da transação de persistência. */
const BATCH_SIZE = 500;

/**
 * Pausa entre chamadas HTTP. CoinGecko free divulga 10-30 req/min, mas em
 * teste real (2026-05-27) caímos em HTTP 429 com 2s entre calls. Subi pra 6s
 * (10 req/min efetivos) — pra 10 cripto é só ~1min de overhead.
 */
const REQUEST_DELAY_MS = 6_000;

/** Timeout por requisição. */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Mapping de símbolo no catálogo (Asset.symbol) → coin id do CoinGecko.
 *
 * Coin ids são identificadores estáveis no CoinGecko (slug). Símbolos de mercado
 * (BTC, ETH) podem colidir entre projetos, então sempre passamos pelo id.
 *
 * Notas:
 * - MATIC: a Polygon migrou de MATIC → POL em 2024. CoinGecko mantém
 *   `matic-network` como referência histórica e `polygon-ecosystem-token` para
 *   o ticker novo. Usuários costumam ter MATIC no catálogo legado.
 */
export const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  USDC: 'usd-coin',
  BNB: 'binancecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  SOL: 'solana',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  AVAX: 'avalanche-2',
  MATIC: 'matic-network',
  POL: 'polygon-ecosystem-token',
};

// ================== TYPES ==================

export interface CoinGeckoMarketChartResponse {
  prices: Array<[number, number]>; // [timestamp_ms, price]
  market_caps?: Array<[number, number]>;
  total_volumes?: Array<[number, number]>;
}

export interface CoinGeckoPricePoint {
  date: Date;
  priceUsd: number;
}

export interface SyncCoinGeckoResult {
  symbol: string;
  coinId: string;
  fetched: number;
  inserted: number;
  updated: number;
  errors: number;
  duration: number;
  dryRun: boolean;
  sample: CoinGeckoPricePoint[];
}

// ================== HELPERS ==================

/**
 * Normaliza um timestamp ms para início do dia em UTC, alinhando com a
 * convenção do AssetPriceHistory (date = UTC midnight).
 */
const normalizeDateToUtcDayStart = (timestampMs: number): Date => {
  const d = new Date(timestampMs);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve o coin id do CoinGecko para um símbolo do catálogo (case-insensitive).
 * Retorna null se não houver mapeamento conhecido.
 */
export const resolveCoinGeckoId = (dbSymbol: string): string | null => {
  if (!dbSymbol?.trim()) return null;
  const key = dbSymbol.trim().toUpperCase();
  return SYMBOL_TO_COINGECKO_ID[key] ?? null;
};

/**
 * Parseia a resposta `market_chart` do CoinGecko em pontos diários.
 *
 * A API devolve um ponto por ~dia para horizontes longos (days > 90), mas
 * para horizontes curtos pode devolver vários por dia. Deduplicamos pela
 * data normalizada (UTC midnight) mantendo o último ponto do dia
 * (geralmente o close).
 *
 * Filtra pontos inválidos (preço <= 0, NaN ou Infinity).
 */
export const parseMarketChartResponse = (
  payload: CoinGeckoMarketChartResponse | null | undefined,
): CoinGeckoPricePoint[] => {
  if (!payload?.prices || !Array.isArray(payload.prices)) return [];

  const byDate = new Map<number, CoinGeckoPricePoint>();
  for (const entry of payload.prices) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [ts, price] = entry;
    if (!Number.isFinite(ts) || !Number.isFinite(price) || price <= 0) continue;
    const date = normalizeDateToUtcDayStart(ts);
    byDate.set(date.getTime(), { date, priceUsd: price });
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
};

// ================== CORE FETCH ==================

/** Tentativas máximas em caso de HTTP 429 antes de propagar o erro. */
const MAX_RETRIES_429 = 3;

/** Backoff exponencial base em ms para HTTP 429. */
const RETRY_BASE_DELAY_MS = 30_000;

/**
 * Busca histórico de preços de uma cripto no CoinGecko.
 *
 * @param coinId  Coin id do CoinGecko (ex: "bitcoin")
 * @param days    Número de dias de histórico OU 'max'. Free tier do CoinGecko
 *                aceita no máximo 365 (HTTP 401 + error_code 10012 acima disso).
 *                Pra 10 anos é necessário API key paga.
 *                Se a moeda tem menos histórico que o pedido, devolve o disponível.
 *
 * Faz retry com backoff exponencial em HTTP 429 (rate limit).
 */
export async function fetchCoinGeckoHistory(
  coinId: string,
  days: number | 'max',
): Promise<CoinGeckoPricePoint[]> {
  if (!coinId?.trim()) throw new Error('coinId é obrigatório');

  const url = `${COINGECKO_BASE_URL}/coins/${encodeURIComponent(coinId)}/market_chart`;
  const params = {
    vs_currency: VS_CURRENCY,
    days: typeof days === 'number' ? String(days) : days,
  };

  for (let attempt = 0; attempt <= MAX_RETRIES_429; attempt++) {
    try {
      const response = await axios.get<CoinGeckoMarketChartResponse>(url, {
        params,
        timeout: REQUEST_TIMEOUT_MS,
        headers: { accept: 'application/json' },
      });
      return parseMarketChartResponse(response.data);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 429 && attempt < MAX_RETRIES_429) {
          const wait = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          logger.warn(
            `[CoinGecko] Rate limit em ${coinId} (HTTP 429). Tentativa ${attempt + 1}/${MAX_RETRIES_429}. Aguardando ${wait / 1000}s...`,
          );
          await sleep(wait);
          continue;
        }
        if (status === 429) {
          logger.warn(
            `[CoinGecko] Rate limit persistente em ${coinId} após ${MAX_RETRIES_429} retries.`,
          );
        } else if (status === 401) {
          logger.warn(
            `[CoinGecko] HTTP 401 para ${coinId}. Provável days > 365 (free tier limita histórico).`,
          );
        } else if (status === 404) {
          logger.warn(`[CoinGecko] Coin id "${coinId}" não encontrado (HTTP 404).`);
        } else {
          logger.error(`[CoinGecko] Erro HTTP ${status ?? '?'} para ${coinId}:`, err.message);
        }
      } else {
        logger.error(`[CoinGecko] Erro inesperado para ${coinId}:`, err);
      }
      throw err;
    }
  }

  // Inalcançável (o loop sempre retorna ou throwa); só pra satisfazer o TS.
  throw new Error(`[CoinGecko] Loop de retry esgotado para ${coinId}`);
}

// ================== CORE SYNC ==================

/**
 * Sincroniza histórico CoinGecko para um símbolo do catálogo.
 *
 * Fluxo:
 *   1. Resolve coinId a partir do dbSymbol via SYMBOL_TO_COINGECKO_ID.
 *   2. Verifica que o Asset existe no catálogo (não criamos).
 *   3. Busca histórico no CoinGecko (em USD).
 *   4. Em modo dry-run: retorna sample sem persistir.
 *   5. Modo apply: createMany em batches com skipDuplicates (idempotente
 *      por unique [symbol, date]). Update count = pontos já existentes.
 *
 * Idempotente: ao rodar 2x não duplica linhas e mantém preço já gravado.
 * Para sobrescrever preços antigos use { overwrite: true } (atualmente
 * não exposto — adicione quando precisar reconciliar BRL legado com USD).
 */
export async function syncCoinGeckoSymbol(
  dbSymbol: string,
  days: number | 'max',
  options?: { dryRun?: boolean },
): Promise<SyncCoinGeckoResult> {
  const startTime = Date.now();
  const dryRun = options?.dryRun ?? true;
  const symbolUpper = dbSymbol.trim().toUpperCase();

  const coinId = resolveCoinGeckoId(symbolUpper);
  if (!coinId) {
    throw new Error(`Símbolo "${dbSymbol}" não tem mapeamento CoinGecko conhecido.`);
  }

  const asset = await prisma.asset.findUnique({
    where: { symbol: symbolUpper },
    select: { id: true, type: true },
  });

  if (!asset) {
    throw new Error(`Asset "${symbolUpper}" não existe no catálogo.`);
  }

  if (asset.type !== 'crypto') {
    throw new Error(`Asset "${symbolUpper}" não é crypto (type=${asset.type}).`);
  }

  logger.info(`[CoinGecko] ${symbolUpper} → ${coinId} (days=${days}, ${dryRun ? 'DRY' : 'APPLY'})`);

  const points = await fetchCoinGeckoHistory(coinId, days);
  const fetched = points.length;

  if (fetched === 0) {
    logger.warn(`[CoinGecko] ${symbolUpper}: 0 pontos retornados.`);
    return {
      symbol: symbolUpper,
      coinId,
      fetched: 0,
      inserted: 0,
      updated: 0,
      errors: 0,
      duration: (Date.now() - startTime) / 1000,
      dryRun,
      sample: [],
    };
  }

  const sample: CoinGeckoPricePoint[] = [
    points[0],
    points[Math.floor(points.length / 2)],
    points[points.length - 1],
  ].filter((p): p is CoinGeckoPricePoint => Boolean(p));

  if (dryRun) {
    logger.info(
      `[CoinGecko] ${symbolUpper}: ${fetched} pontos (dry-run, nada persistido). Primeiro: ${points[0].date.toISOString().slice(0, 10)}, último: ${points[points.length - 1].date.toISOString().slice(0, 10)}.`,
    );
    return {
      symbol: symbolUpper,
      coinId,
      fetched,
      inserted: 0,
      updated: 0,
      errors: 0,
      duration: (Date.now() - startTime) / 1000,
      dryRun: true,
      sample,
    };
  }

  // Persistência: createMany com skipDuplicates é idempotente. Conta de
  // updated = pontos cuja data já existia. Carrega datas existentes uma vez
  // para evitar N queries.
  const existingDates = await prisma.assetPriceHistory.findMany({
    where: {
      symbol: symbolUpper,
      date: { in: points.map((p) => p.date) },
    },
    select: { date: true },
  });
  const existingSet = new Set(existingDates.map((e) => e.date.getTime()));

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    try {
      const result = await prisma.assetPriceHistory.createMany({
        data: batch.map((p) => ({
          assetId: asset.id,
          symbol: symbolUpper,
          price: new Decimal(p.priceUsd),
          currency: PERSIST_CURRENCY,
          source: SOURCE,
          date: p.date,
        })),
        skipDuplicates: true,
      });
      inserted += result.count;
      for (const p of batch) {
        if (existingSet.has(p.date.getTime())) updated++;
      }
    } catch (err) {
      logger.error(`[CoinGecko] Erro em batch ${i}-${i + batch.length} de ${symbolUpper}:`, err);
      errors += batch.length;
    }
  }

  const duration = (Date.now() - startTime) / 1000;
  logger.info(
    `[CoinGecko] ${symbolUpper}: ${inserted} inseridos, ${updated} já existiam, ${errors} erros em ${duration.toFixed(1)}s`,
  );

  return {
    symbol: symbolUpper,
    coinId,
    fetched,
    inserted,
    updated,
    errors,
    duration,
    dryRun: false,
    sample,
  };
}

/**
 * Sincroniza histórico CoinGecko para múltiplos símbolos do catálogo,
 * respeitando o rate-limit free entre chamadas.
 *
 * Pula símbolos sem mapeamento (não erra — só loga). Falha por símbolo
 * é registrada no result mas não interrompe os outros.
 */
export async function syncCoinGeckoBatch(
  dbSymbols: string[],
  days: number | 'max',
  options?: { dryRun?: boolean; delayMs?: number },
): Promise<SyncCoinGeckoResult[]> {
  const dryRun = options?.dryRun ?? true;
  const delayMs = options?.delayMs ?? REQUEST_DELAY_MS;

  const results: SyncCoinGeckoResult[] = [];
  for (let i = 0; i < dbSymbols.length; i++) {
    const sym = dbSymbols[i];
    const coinId = resolveCoinGeckoId(sym);
    if (!coinId) {
      logger.warn(`[CoinGecko] Pulando "${sym}" — sem mapeamento conhecido.`);
      continue;
    }

    try {
      const result = await syncCoinGeckoSymbol(sym, days, { dryRun });
      results.push(result);
    } catch (err) {
      logger.error(`[CoinGecko] Falhou para ${sym}:`, err);
      results.push({
        symbol: sym.toUpperCase(),
        coinId,
        fetched: 0,
        inserted: 0,
        updated: 0,
        errors: 1,
        duration: 0,
        dryRun,
        sample: [],
      });
    }

    if (i < dbSymbols.length - 1) {
      await sleep(delayMs);
    }
  }

  return results;
}
