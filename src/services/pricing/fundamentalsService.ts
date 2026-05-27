/**
 * Serviço de fundamentos (P/L, Beta, Dividend Yield).
 * Regra: banco primeiro, fallback BRAPI com persistência.
 *
 * Bug F1.9: o endpoint legado `?fundamental=true` só devolve `priceEarnings`
 * e `earningsPerShare` no plano da BRAPI; `beta` e `dividendYield` ficam de
 * fora, então no DB toda linha tinha esses dois campos NULL. Migrado para o
 * módulo `defaultKeyStatistics`, que devolve todos os três campos no mesmo
 * payload. Combinado com o cron diário `/api/cron/brapi-sync/fundamentals`,
 * o `AssetFundamentals` deixa de depender de lazy fetch.
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const BLOCKED_SYMBOL_PREFIXES = [
  'RESERVA-EMERG',
  'RESERVA-OPORT',
  'PERSONALIZADO',
  'RENDA-FIXA',
  'CONTA-CORRENTE',
];

const isBlockedSymbol = (symbol: string) =>
  BLOCKED_SYMBOL_PREFIXES.some((p) => symbol.toUpperCase().startsWith(p));

const getBrapiSymbolsToTry = (symbol: string): string[] => {
  const s = symbol.trim().toUpperCase();
  const isB3Stock = /^[A-Z0-9]{4,6}(3|4|11|34)$/.test(s) && !s.startsWith('^');
  if (isB3Stock && !s.endsWith('.SA')) {
    return [s, `${s}.SA`];
  }
  return [s];
};

const parseNumericValue = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const normalized = value
      .replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export interface FundamentalsData {
  pl: number | null;
  beta: number | null;
  dividendYield: number | null;
}

const EMPTY: FundamentalsData = { pl: null, beta: null, dividendYield: null };

/**
 * Busca fundamentos do banco.
 */
const getFundamentalsFromDb = async (symbol: string): Promise<FundamentalsData | null> => {
  const normalized = symbol.trim().toUpperCase();
  const row = await prisma.assetFundamentals.findUnique({
    where: { symbol: normalized },
  });
  if (!row) return null;
  return {
    pl: row.priceEarnings,
    beta: row.beta,
    dividendYield: row.dividendYield,
  };
};

/**
 * Normaliza um result do `?modules=defaultKeyStatistics` da BRAPI.
 *
 * - P/L: prefere `defaultKeyStatistics.trailingPE` (mais atualizado), cai pra
 *   `priceEarnings` do quote principal quando ausente.
 * - Beta: vem só em `defaultKeyStatistics.beta`.
 * - Dividend Yield: BRAPI devolve em decimal (0.07 = 7%). Convertemos pra
 *   percentual antes de persistir pra bater com o formato exibido na UI
 *   (`fundamentos.dividendYield.toFixed(2)%`).
 */
const extractFundamentalsFromBrapiResult = (result: Record<string, unknown>): FundamentalsData => {
  const dks = (result.defaultKeyStatistics ?? {}) as Record<string, unknown>;
  const pl = parseNumericValue(
    dks.trailingPE ?? result.priceEarnings ?? result.pe ?? result.priceEarningsRatio,
  );
  const beta = parseNumericValue(dks.beta);
  // Alguns ativos (FIIs, ETFs) só trazem `yield` em vez de `dividendYield`.
  const dyDecimal = parseNumericValue(
    dks.dividendYield ?? dks.yield ?? result.dividendYield ?? result.dividendYields ?? result.dy,
  );
  return {
    pl: pl !== null && pl > 0 ? pl : null,
    beta: beta !== null ? beta : null,
    // Múltipla por 100 → percentual. Já tinha guard de > 0 antes,
    // mantemos pra rejeitar resultados zerados que confundem o UI.
    dividendYield: dyDecimal !== null && dyDecimal > 0 ? dyDecimal * 100 : null,
  };
};

const persistFundamentals = async (
  symbol: string,
  fundamentals: FundamentalsData,
): Promise<void> => {
  const dbSymbol = symbol.trim().toUpperCase();
  await prisma.assetFundamentals.upsert({
    where: { symbol: dbSymbol },
    update: {
      priceEarnings: fundamentals.pl,
      beta: fundamentals.beta,
      dividendYield: fundamentals.dividendYield,
      updatedAt: new Date(),
    },
    create: {
      symbol: dbSymbol,
      priceEarnings: fundamentals.pl,
      beta: fundamentals.beta,
      dividendYield: fundamentals.dividendYield,
    },
  });
};

/**
 * Busca fundamentos na BRAPI (modules=defaultKeyStatistics) e persiste no banco.
 */
const fetchAndPersistFundamentalsFromBrapi = async (symbol: string): Promise<FundamentalsData> => {
  const apiKey = process.env.BRAPI_API_KEY;
  const tokenParam = apiKey ? `&token=${apiKey}` : '';
  const symbolsToTry = getBrapiSymbolsToTry(symbol);

  for (const currentSymbol of symbolsToTry) {
    const url = `https://brapi.dev/api/quote/${encodeURIComponent(currentSymbol)}?modules=defaultKeyStatistics${tokenParam}`;
    try {
      const response = await fetchWithTimeout(url, {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) continue;

      const data = await response.json();
      const results = data?.results;
      if (!Array.isArray(results) || results.length === 0) continue;

      const result = (results[0] || {}) as Record<string, unknown>;
      const fundamentals = extractFundamentalsFromBrapiResult(result);
      await persistFundamentals(symbol, fundamentals);
      return fundamentals;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        logger.warn(`[fundamentalsService] timeout buscando ${currentSymbol}`);
      } else {
        logger.warn(`[fundamentalsService] erro buscando ${currentSymbol}:`, err);
      }
      continue;
    }
  }
  return EMPTY;
};

/**
 * Busca fundamentos: banco primeiro, fallback BRAPI com persistência.
 */
export const getFundamentals = async (
  symbol: string,
  options?: { useBrapiFallback?: boolean },
): Promise<FundamentalsData> => {
  if (!symbol?.trim()) return EMPTY;
  if (isBlockedSymbol(symbol)) return EMPTY;

  const useFallback = options?.useBrapiFallback !== false;

  const fromDb = await getFundamentalsFromDb(symbol);
  if (fromDb && (fromDb.pl !== null || fromDb.beta !== null || fromDb.dividendYield !== null)) {
    return fromDb;
  }

  if (useFallback) {
    return fetchAndPersistFundamentalsFromBrapi(symbol);
  }
  return EMPTY;
};

const BATCH_SIZE = 15;

/**
 * Sincroniza fundamentos para um conjunto de symbols em batch.
 * Usado pelo cron diário e pelo script de backfill.
 *
 * BRAPI aceita até 20 símbolos por request no `/api/quote`. Usamos 15 pra
 * margem em casos de symbols longos (.SA suffix) que aumentam o URL.
 *
 * Idempotente: roda upsert por symbol; mesmos symbols 2x produzem o mesmo
 * resultado final.
 */
export const syncFundamentalsForSymbols = async (
  symbols: string[],
): Promise<{
  processed: number;
  updated: number;
  withData: number;
  errors: Array<{ symbol: string; error: string }>;
}> => {
  const apiKey = process.env.BRAPI_API_KEY;
  if (!apiKey) {
    return {
      processed: 0,
      updated: 0,
      withData: 0,
      errors: [{ symbol: '*', error: 'BRAPI_API_KEY não configurada' }],
    };
  }

  const valid = [
    ...new Set(
      symbols
        .map((s) => s?.trim().toUpperCase())
        .filter((s): s is string => Boolean(s) && !isBlockedSymbol(s)),
    ),
  ];

  let processed = 0;
  let updated = 0;
  let withData = 0;
  const errors: Array<{ symbol: string; error: string }> = [];

  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    const batch = valid.slice(i, i + BATCH_SIZE);
    const url = `https://brapi.dev/api/quote/${encodeURIComponent(batch.join(','))}?modules=defaultKeyStatistics&token=${apiKey}`;
    try {
      const response = await fetchWithTimeout(url, {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) {
        // 404 = batch totalmente inválido (símbolos não existem na BRAPI).
        // Conta como processado mas não persiste — esses symbols simplesmente
        // não têm fundamentos disponíveis.
        if (response.status === 404) {
          processed += batch.length;
          continue;
        }
        errors.push({ symbol: batch.join(','), error: `HTTP ${response.status}` });
        continue;
      }

      const data = await response.json();
      const results = Array.isArray(data?.results) ? data.results : [];
      const bySymbol = new Map<string, Record<string, unknown>>();
      for (const r of results) {
        const s = String((r as Record<string, unknown>).symbol ?? '').toUpperCase();
        if (s) bySymbol.set(s, r as Record<string, unknown>);
      }

      for (const symbol of batch) {
        processed += 1;
        const result = bySymbol.get(symbol);
        if (!result) continue;
        const fundamentals = extractFundamentalsFromBrapiResult(result);
        try {
          await persistFundamentals(symbol, fundamentals);
          updated += 1;
          if (
            fundamentals.pl !== null ||
            fundamentals.beta !== null ||
            fundamentals.dividendYield !== null
          ) {
            withData += 1;
          }
        } catch (err) {
          errors.push({ symbol, error: err instanceof Error ? err.message : String(err) });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ symbol: batch.join(','), error: msg });
    }
  }

  return { processed, updated, withData, errors };
};

// Exporta helper interno só pra testes — não usar em outras partes.
export const __internal = {
  extractFundamentalsFromBrapiResult,
};
