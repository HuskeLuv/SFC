/**
 * Serviço de fundamentos (P/L, Beta, Dividend Yield).
 * Regra: banco primeiro, fallback BRAPI com persistência.
 */

import { prisma } from '@/lib/prisma';

const BLOCKED_SYMBOL_PREFIXES = ['RESERVA-EMERG', 'RESERVA-OPORT', 'PERSONALIZADO', 'RENDA-FIXA', 'CONTA-CORRENTE'];

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
    const normalized = value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
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
 * Busca fundamentos na BRAPI e persiste no banco.
 */
const fetchAndPersistFundamentalsFromBrapi = async (
  symbol: string
): Promise<FundamentalsData> => {
  const apiKey = process.env.BRAPI_API_KEY;
  const tokenParam = apiKey ? `&token=${apiKey}` : '';
  const symbolsToTry = getBrapiSymbolsToTry(symbol);

  for (const currentSymbol of symbolsToTry) {
    const url = `https://brapi.dev/api/quote/${encodeURIComponent(currentSymbol)}?fundamental=true${tokenParam}`;
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) continue;

    const data = await response.json();
    const results = data?.results;
    if (!Array.isArray(results) || results.length === 0) continue;

    const result = results[0] || {};
    const pl = parseNumericValue(result.priceEarnings ?? result.pe ?? result.priceEarningsRatio);
    const beta = parseNumericValue(result.beta);
    const dy = parseNumericValue(result.dividendYield ?? result.dividendYields ?? result.dy);

    const fundamentals: FundamentalsData = {
      pl: pl !== null && pl > 0 ? pl : null,
      beta: beta !== null ? beta : null,
      dividendYield: dy !== null && dy > 0 ? dy : null,
    };

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

    return fundamentals;
  }
  return { pl: null, beta: null, dividendYield: null };
};

/**
 * Busca fundamentos: banco primeiro, fallback BRAPI com persistência.
 */
export const getFundamentals = async (
  symbol: string,
  options?: { useBrapiFallback?: boolean }
): Promise<FundamentalsData> => {
  if (!symbol?.trim()) return { pl: null, beta: null, dividendYield: null };
  if (isBlockedSymbol(symbol)) return { pl: null, beta: null, dividendYield: null };

  const useFallback = options?.useBrapiFallback !== false;

  const fromDb = await getFundamentalsFromDb(symbol);
  if (fromDb && (fromDb.pl !== null || fromDb.beta !== null || fromDb.dividendYield !== null)) {
    return fromDb;
  }

  if (useFallback) {
    return fetchAndPersistFundamentalsFromBrapi(symbol);
  }
  return { pl: null, beta: null, dividendYield: null };
};
