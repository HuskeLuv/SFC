/**
 * Serviço de proventos/dividendos e ações corporativas (split/inplit/bonificação).
 * Regra: banco primeiro, fallback BRAPI apenas quando necessário, persistir no banco.
 */

import { prisma } from '@/lib/prisma';

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

const getDbSymbolVariants = (symbol: string): string[] => {
  const s = symbol.trim().toUpperCase();
  return [...new Set([s, ...getBrapiSymbolsToTry(symbol).map((x) => x.toUpperCase())])];
};

const extractDividendDate = (dividend: Record<string, unknown>): Date | null => {
  const rawDate =
    (dividend.paymentDate as number | string) ??
    (dividend.payDate as number | string) ??
    (dividend.date as number | string) ??
    (dividend.exDate as number | string) ??
    (dividend.exDividendDate as number | string) ??
    (dividend.recordDate as number | string);
  if (!rawDate) return null;
  const numericDate = typeof rawDate === 'number' ? rawDate : Number(rawDate);
  if (Number.isFinite(numericDate)) {
    const timestamp = numericDate < 1e12 ? numericDate * 1000 : numericDate;
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const parsed = new Date(rawDate as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

const extractDividendAmount = (dividend: Record<string, unknown>): number | null => {
  const amount =
    (dividend.cashAmount as unknown) ??
    (dividend.amount as unknown) ??
    (dividend.value as unknown) ??
    (dividend.dividend as unknown) ??
    (dividend.rate as unknown) ??
    (dividend.dividendValue as unknown);
  return parseNumericValue(amount);
};

const extractDividendType = (dividend: Record<string, unknown>): string => {
  return (
    (dividend.type as string) ??
    (dividend.kind as string) ??
    (dividend.label as string) ??
    (dividend.dividendType as string) ??
    'Dividendo'
  );
};

const normalizeDividendContainer = (container: unknown): Array<Record<string, unknown>> => {
  if (!container || typeof container !== 'object') return [];
  if (Array.isArray(container)) return container as Array<Record<string, unknown>>;
  const obj = container as Record<string, unknown>;
  const possibleArrays = [
    obj.dividends,
    obj.dividendsData,
    obj.dividendsHistory,
    obj.cashDividends,
    obj.events,
  ].filter(Array.isArray) as Array<Record<string, unknown>[]>;
  return possibleArrays.flat();
};

/** BRAPI pode enviar `dividends: []` (truthy) e os dados reais em `dividendsData.cashDividends`. */
const flattenBrapiResultDividends = (
  result: Record<string, unknown>,
): Array<Record<string, unknown>> => {
  const chunks: unknown[] = [
    result.dividends,
    result.dividendsHistory,
    result.cashDividends,
    result.events,
    result.dividendsData,
  ];
  const merged: Array<Record<string, unknown>> = [];
  for (const chunk of chunks) {
    merged.push(...normalizeDividendContainer(chunk));
  }
  return merged;
};

/**
 * Extract stockDividends (splits/inplits/bonuses) from BRAPI result.
 * These live in `result.dividendsData.stockDividends`.
 */
const extractStockDividends = (result: Record<string, unknown>): Array<Record<string, unknown>> => {
  const dividendsData = result.dividendsData as Record<string, unknown> | undefined;
  if (!dividendsData || typeof dividendsData !== 'object') return [];
  const stockDividends = dividendsData.stockDividends;
  if (!Array.isArray(stockDividends)) return [];
  return stockDividends as Array<Record<string, unknown>>;
};

// ================== TYPES ==================

export interface DividendEntry {
  date: Date;
  tipo: string;
  valorUnitario: number;
}

export interface CorporateActionEntry {
  date: Date;
  type: string; // "DESDOBRAMENTO" | "GRUPAMENTO" | "BONIFICACAO"
  factor: number;
  completeFactor: string | null;
  isinCode: string | null;
}

// ================== DIVIDEND FUNCTIONS ==================

/**
 * Busca dividendos do banco para um símbolo.
 */
const getDividendsFromDb = async (symbol: string): Promise<DividendEntry[]> => {
  const variants = getDbSymbolVariants(symbol);
  const rows = await prisma.assetDividendHistory.findMany({
    where: { symbol: { in: variants } },
    orderBy: { date: 'asc' },
    select: { date: true, tipo: true, valorUnitario: true },
  });
  const byKey = new Map<string, DividendEntry>();
  for (const r of rows) {
    const key = `${r.date.getTime()}\0${r.tipo}`;
    if (!byKey.has(key)) {
      byKey.set(key, { date: r.date, tipo: r.tipo, valorUnitario: r.valorUnitario });
    }
  }
  return [...byKey.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
};

/**
 * Busca dividendos na BRAPI e persiste no banco.
 * Also extracts and persists corporate actions (splits/inplits/bonuses) from the same response.
 */
const fetchAndPersistDividendsFromBrapi = async (symbol: string): Promise<DividendEntry[]> => {
  const apiKey = process.env.BRAPI_API_KEY;
  const tokenParam = apiKey ? `&token=${apiKey}` : '';
  const symbolsToTry = getBrapiSymbolsToTry(symbol);

  for (const currentSymbol of symbolsToTry) {
    const url = `https://brapi.dev/api/quote/${encodeURIComponent(currentSymbol)}?dividends=true${tokenParam}`;
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) continue;

    const data = await response.json();
    const results = data?.results;
    if (!Array.isArray(results) || results.length === 0) continue;

    const result = (results[0] || {}) as Record<string, unknown>;
    const normalized = flattenBrapiResultDividends(result);

    const dbSymbol = symbol.trim().toUpperCase();
    const entries: DividendEntry[] = [];

    // Persist cash dividends
    for (const d of normalized) {
      const date = extractDividendDate(d);
      const valorUnitario = extractDividendAmount(d);
      if (!date || !valorUnitario || valorUnitario <= 0) continue;

      const tipo = extractDividendType(d);
      entries.push({ date, tipo, valorUnitario });

      const dateNorm = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      await prisma.assetDividendHistory.upsert({
        where: {
          symbol_date_tipo: {
            symbol: dbSymbol,
            date: dateNorm,
            tipo,
          },
        },
        update: { valorUnitario },
        create: {
          symbol: dbSymbol,
          date: dateNorm,
          tipo,
          valorUnitario,
          source: 'BRAPI',
        },
      });
    }

    // Persist corporate actions (splits/inplits/bonuses) from same response
    const stockDividends = extractStockDividends(result);
    for (const sd of stockDividends) {
      const type = (sd.label as string) || '';
      const factor = Number(sd.factor);
      if (!type || !Number.isFinite(factor) || factor <= 0) continue;

      const rawDate = (sd.lastDatePrior as string) || (sd.approvedOn as string);
      if (!rawDate) continue;
      const parsed = new Date(rawDate);
      if (Number.isNaN(parsed.getTime())) continue;

      const dateNorm = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());

      try {
        await prisma.assetCorporateAction.upsert({
          where: {
            symbol_date_type: {
              symbol: dbSymbol,
              date: dateNorm,
              type,
            },
          },
          update: { factor, completeFactor: (sd.completeFactor as string) || null },
          create: {
            symbol: dbSymbol,
            date: dateNorm,
            type,
            factor,
            completeFactor: (sd.completeFactor as string) || null,
            isinCode: (sd.isinCode as string) || null,
            source: 'BRAPI',
          },
        });
      } catch {
        // Silently continue — corporate actions are best-effort
      }
    }

    if (entries.length > 0 || stockDividends.length > 0) return entries;
  }
  return [];
};

/**
 * Busca dividendos: banco primeiro, fallback BRAPI com persistência.
 */
export const getDividends = async (
  symbol: string,
  options?: { useBrapiFallback?: boolean },
): Promise<DividendEntry[]> => {
  if (!symbol?.trim()) return [];
  if (isBlockedSymbol(symbol)) return [];

  const useFallback = options?.useBrapiFallback !== false;

  const fromDb = await getDividendsFromDb(symbol);
  if (fromDb.length > 0) return fromDb;

  if (useFallback) {
    return fetchAndPersistDividendsFromBrapi(symbol);
  }
  return [];
};

// ================== CORPORATE ACTION FUNCTIONS ==================

/**
 * Busca ações corporativas (splits/inplits/bonificações) do banco.
 */
const getCorporateActionsFromDb = async (symbol: string): Promise<CorporateActionEntry[]> => {
  const variants = getDbSymbolVariants(symbol);
  const rows = await prisma.assetCorporateAction.findMany({
    where: { symbol: { in: variants } },
    orderBy: { date: 'asc' },
    select: { date: true, type: true, factor: true, completeFactor: true, isinCode: true },
  });
  return rows.map((r) => ({
    date: r.date,
    type: r.type,
    factor: r.factor,
    completeFactor: r.completeFactor,
    isinCode: r.isinCode,
  }));
};

/**
 * Busca ações corporativas: banco primeiro, fallback BRAPI (via getDividends que persiste ambos).
 */
export const getCorporateActions = async (
  symbol: string,
  options?: { useBrapiFallback?: boolean },
): Promise<CorporateActionEntry[]> => {
  if (!symbol?.trim()) return [];
  if (isBlockedSymbol(symbol)) return [];

  const fromDb = await getCorporateActionsFromDb(symbol);
  if (fromDb.length > 0) return fromDb;

  // Trigger BRAPI fetch (which persists both dividends AND corporate actions)
  if (options?.useBrapiFallback !== false) {
    await fetchAndPersistDividendsFromBrapi(symbol);
    return getCorporateActionsFromDb(symbol);
  }
  return [];
};
