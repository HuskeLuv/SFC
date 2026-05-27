/**
 * F2.3 — Sync de histórico de índices/moedas via Yahoo Finance.
 *
 * Cobre o gap de IBOV (^BVSP) e USD/BRL (BRL=X) — fontes pra benchmark de
 * carteira e câmbio histórico, que hoje só existem no `MarketIndicatorCache`
 * (snapshot atual). Yahoo dá 20+ anos de histórico gratuito.
 *
 * Tickers conhecidos:
 *   ^BVSP   → IBOVESPA (gravamos com symbol `^BVSP` em Asset)
 *   BRL=X   → USD/BRL  (gravamos com symbol `USD-BRL` em Asset)
 *   ^IBX50  → IBX-50   (opcional, gravamos com symbol `^IBX50`)
 *
 * Endpoint usado:
 *   https://query1.finance.yahoo.com/v8/finance/chart/{ticker}
 *     ?period1=SEC_START&period2=SEC_END&interval=1d&events=history
 *
 * Idempotente — upsert via unique [symbol, date]. Fonte gravada como
 * `YAHOO_FINANCE` em AssetPriceHistory.source.
 *
 * NÃO altera os pipelines BRAPI/COTAHIST/Tesouro existentes; é um terceiro
 * source independente cujo único cliente é o backfill manual + (futuro)
 * cron leve. Em `Asset` aceita `source` `brapi` (default) — o asset row é
 * compartilhado com a sync diária BRAPI; é só o `AssetPriceHistory.source`
 * que distingue a origem da linha.
 */
import { logger } from '@/lib/logger';
import { Decimal } from '@prisma/client/runtime/library';
import prisma from '@/lib/prisma';

// ================== CONSTANTS ==================

/**
 * Yahoo tem dois mirrors: query1 e query2. Em testes empíricos, query1
 * devolve 429 com frequência (rate limit por IP mais agressivo); query2
 * é mais permissivo. Tentamos query1 primeiro e fazemos fallback.
 */
const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

const YAHOO_CHART_URL = (host: string, ticker: string) =>
  `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}`;

/**
 * Yahoo recusa requests sem User-Agent ou com strings que casem com listas de
 * UAs comuns (testamos UA completo de Chrome e leva 429 imediato). Um UA
 * minimalista `Mozilla/5.0` empiricamente passa por query1 + query2.
 *
 * NOTA: usamos `fetch` nativo (Node 20+) em vez de axios. Axios adiciona
 * headers padrão (`Accept-Encoding: gzip, deflate, br`, etc.) que também
 * disparam o anti-bot do Yahoo. `fetch` nativo com headers mínimos passa.
 */
const USER_AGENT = 'Mozilla/5.0';

const REQUEST_TIMEOUT_MS = 30_000;

/** Source value gravado em `AssetPriceHistory.source`. */
export const YAHOO_SOURCE = 'YAHOO_FINANCE';

/** Tamanho do batch ao persistir — Prisma createMany aceita 1000+ sem problema. */
const BATCH_SIZE = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

// ================== TYPES ==================

export interface YahooHistoryPoint {
  /** Data normalizada para início do dia UTC (00:00:00.000Z). */
  date: Date;
  /** Fechamento ajustado quando disponível, senão close. */
  close: number;
}

export interface YahooSyncResult {
  yahooTicker: string;
  dbSymbol: string;
  fetched: number;
  inserted: number;
  updated: number;
  errors: number;
  /** Primeira e última data presentes no histórico baixado (úteis pro log). */
  firstDate: Date | null;
  lastDate: Date | null;
  duration: number;
  dryRun: boolean;
  /** Até 3 pontos pra amostragem visual. */
  sample: YahooHistoryPoint[];
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        symbol?: string;
        longName?: string;
        instrumentType?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{ close?: Array<number | null> }>;
        adjclose?: Array<{ adjclose?: Array<number | null> }>;
      };
    }> | null;
    error?: { code?: string; description?: string } | null;
  };
}

// ================== HELPERS ==================

/** Normaliza Date para 00:00:00.000 UTC — chave usada no índice [symbol, date]. */
function normalizeDateToUtcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Convenção de moeda gravada em Asset/AssetPriceHistory.
 * Yahoo `BRL=X` é a paridade USD→BRL e a `meta.currency` vem como `BRL`
 * (representa "quantos BRL por 1 USD"). Mantemos `BRL` pra consistência
 * com o Asset existente (`USD-BRL` já é currency=BRL no banco).
 */
function currencyFromTicker(yahooTicker: string, metaCurrency?: string): string {
  if (yahooTicker === 'BRL=X') return 'BRL';
  if (yahooTicker.startsWith('^')) return 'BRL';
  return metaCurrency ?? 'BRL';
}

/** Decide o `Asset.type` baseado no ticker — usado quando criamos o Asset. */
function assetTypeFromTicker(yahooTicker: string): string {
  if (yahooTicker === 'BRL=X') return 'currency';
  if (yahooTicker.startsWith('^')) return 'index';
  return 'index';
}

/** Nome amigável usado pra criar o Asset, quando inexistente. */
function assetNameFromTicker(yahooTicker: string, fallback?: string): string {
  if (yahooTicker === '^BVSP') return 'IBOVESPA';
  if (yahooTicker === 'BRL=X') return 'Dólar Americano (USD)';
  if (yahooTicker === '^IBX50') return 'IBX-50';
  return fallback ?? yahooTicker;
}

// ================== CORE FETCH ==================

/**
 * Baixa N anos de histórico diário do Yahoo Finance pra um ticker.
 * Retorna pontos ordenados crescentemente por data, com data normalizada
 * pra início do dia UTC. Pontos com close <= 0 ou não-finito são descartados.
 *
 * Não persiste nada; pra persistir, use `syncYahooSymbol`.
 */
export async function fetchYahooHistory(
  ticker: string,
  years: number,
): Promise<YahooHistoryPoint[]> {
  if (years <= 0) throw new Error('years deve ser > 0');

  const nowSec = Math.floor(Date.now() / 1000);
  const period1 = nowSec - Math.ceil(years * 365.25 * 24 * 60 * 60);
  const period2 = nowSec;

  const queryString = `?period1=${period1}&period2=${period2}&interval=1d&events=history`;

  let data: YahooChartResponse | null = null;
  let lastErr: unknown = null;
  for (const host of YAHOO_HOSTS) {
    const url = `${YAHOO_CHART_URL(host, ticker)}${queryString}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (!response.ok) {
        // 429/5xx: tenta o próximo mirror.
        lastErr = new Error(`Yahoo HTTP ${response.status} via ${host} para ${ticker}`);
        continue;
      }
      data = (await response.json()) as YahooChartResponse;
      break;
    } catch (err) {
      lastErr = err;
      continue;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (!data) {
    throw lastErr instanceof Error
      ? lastErr
      : new Error(`Falha ao buscar ${ticker} em todos os mirrors do Yahoo`);
  }

  const yahooError = data?.chart?.error;
  if (yahooError) {
    throw new Error(
      `Yahoo retornou erro para ${ticker}: ${yahooError.code ?? 'unknown'} — ${yahooError.description ?? ''}`,
    );
  }

  const result = data?.chart?.result?.[0];
  if (!result) {
    throw new Error(`Yahoo retornou result vazio para ${ticker}`);
  }

  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const adjcloses = result.indicators?.adjclose?.[0]?.adjclose ?? [];

  if (timestamps.length === 0) {
    return [];
  }

  const points: YahooHistoryPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    if (!Number.isFinite(ts) || ts <= 0) continue;
    // Prefere adjclose (split-adjusted) — pra índices não muda nada, pra ações
    // sim. Cai pra close se adjclose for null/undefined.
    const raw = adjcloses[i] ?? closes[i];
    if (raw === null || raw === undefined) continue;
    const close = Number(raw);
    if (!Number.isFinite(close) || close <= 0) continue;

    points.push({
      date: normalizeDateToUtcDayStart(new Date(ts * 1000)),
      close,
    });
  }

  // Dedup por data (Yahoo às vezes manda intraday + close no último dia).
  // Mantém o último close pra cada data.
  const byDate = new Map<number, YahooHistoryPoint>();
  for (const p of points) {
    byDate.set(p.date.getTime(), p);
  }

  const deduped = Array.from(byDate.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

  return deduped;
}

// ================== UPSERT ==================

/**
 * Resolve o Asset row pra `dbSymbol`. Se não existir, cria com defaults
 * adequados ao ticker Yahoo (index/currency). Idempotente.
 */
async function ensureAsset(
  yahooTicker: string,
  dbSymbol: string,
  metaCurrency?: string,
): Promise<{ id: string; currency: string }> {
  const existing = await prisma.asset.findUnique({
    where: { symbol: dbSymbol },
    select: { id: true, currency: true },
  });
  if (existing) return existing;

  const created = await prisma.asset.upsert({
    where: { symbol: dbSymbol },
    create: {
      symbol: dbSymbol,
      name: assetNameFromTicker(yahooTicker),
      type: assetTypeFromTicker(yahooTicker),
      currency: currencyFromTicker(yahooTicker, metaCurrency),
      // Source aqui é da entidade Asset; mantém `brapi` (default no schema)
      // pra não quebrar telas que filtram por source. Asset é shared.
      source: 'brapi',
    },
    update: {},
    select: { id: true, currency: true },
  });
  return created;
}

/**
 * Sincroniza histórico de um ticker Yahoo em `AssetPriceHistory`,
 * gravando como `source = YAHOO_FINANCE`.
 *
 * @param yahooTicker Ticker no Yahoo (ex: `^BVSP`, `BRL=X`).
 * @param dbSymbol Symbol gravado em Asset/AssetPriceHistory.
 * @param years Janela de histórico em anos.
 * @param options.dryRun Quando true, busca e parseia mas não persiste.
 */
export async function syncYahooSymbol(
  yahooTicker: string,
  dbSymbol: string,
  years: number,
  options: { dryRun?: boolean } = {},
): Promise<YahooSyncResult> {
  const startTime = Date.now();
  const dryRun = options.dryRun ?? false;

  logger.info(
    `📥 [YAHOO ${yahooTicker} → ${dbSymbol}] Iniciando sync (${dryRun ? 'DRY RUN' : 'APPLY'}) — ${years}y`,
  );

  const points = await fetchYahooHistory(yahooTicker, years);
  const sample = points.slice(0, 3);
  const firstDate = points.length > 0 ? points[0].date : null;
  const lastDate = points.length > 0 ? points[points.length - 1].date : null;

  logger.info(
    `   📊 ${points.length} pontos | ${firstDate?.toISOString().slice(0, 10) ?? '-'} → ${lastDate?.toISOString().slice(0, 10) ?? '-'}`,
  );

  if (dryRun) {
    const duration = (Date.now() - startTime) / 1000;
    return {
      yahooTicker,
      dbSymbol,
      fetched: points.length,
      inserted: 0,
      updated: 0,
      errors: 0,
      firstDate,
      lastDate,
      duration,
      dryRun: true,
      sample,
    };
  }

  if (points.length === 0) {
    return {
      yahooTicker,
      dbSymbol,
      fetched: 0,
      inserted: 0,
      updated: 0,
      errors: 0,
      firstDate: null,
      lastDate: null,
      duration: (Date.now() - startTime) / 1000,
      dryRun: false,
      sample: [],
    };
  }

  const asset = await ensureAsset(yahooTicker, dbSymbol);

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    try {
      // Identifica registros já presentes pra distinguir insert vs update
      // no contador (mesma estratégia do cotahistB3Sync).
      const existing = await prisma.assetPriceHistory.findMany({
        where: {
          symbol: dbSymbol,
          date: { in: batch.map((p) => p.date) },
        },
        select: { date: true },
      });
      const existingSet = new Set(existing.map((e) => e.date.toISOString()));

      const ops = batch.map((p) =>
        prisma.assetPriceHistory.upsert({
          where: { symbol_date: { symbol: dbSymbol, date: p.date } },
          update: {
            price: new Decimal(p.close),
            currency: asset.currency,
            source: YAHOO_SOURCE,
          },
          create: {
            assetId: asset.id,
            symbol: dbSymbol,
            price: new Decimal(p.close),
            currency: asset.currency,
            source: YAHOO_SOURCE,
            date: p.date,
          },
        }),
      );

      await prisma.$transaction(ops);

      for (const p of batch) {
        if (existingSet.has(p.date.toISOString())) updated++;
        else inserted++;
      }
    } catch (err) {
      logger.error(`   ❌ Batch ${i}-${i + batch.length} falhou para ${dbSymbol}:`, err);
      errors += batch.length;
    }
  }

  const duration = (Date.now() - startTime) / 1000;
  logger.info(
    `   ✅ [YAHOO ${dbSymbol}] ${inserted} ins, ${updated} upd, ${errors} err em ${duration.toFixed(1)}s`,
  );

  return {
    yahooTicker,
    dbSymbol,
    fetched: points.length,
    inserted,
    updated,
    errors,
    firstDate,
    lastDate,
    duration,
    dryRun: false,
    sample,
  };
}

// ================== EXPORT INTERNALS FOR TESTS ==================

/** Exposto pra testes — não usar fora de `__tests__`. */
export const __internals__ = {
  normalizeDateToUtcDayStart,
  currencyFromTicker,
  assetTypeFromTicker,
  assetNameFromTicker,
  DAY_MS,
};
