/**
 * Serviço centralizado para leitura de preços de ativos.
 * Regra: banco primeiro, fallback BRAPI apenas quando necessário.
 * Nunca consultar BRAPI diretamente no frontend.
 */

import prisma from '@/lib/prisma';
import { fetchQuotes } from '@/services/brapiQuote';
import { Decimal } from '@prisma/client/runtime/library';

const normalizeDateToDayStart = (date: Date): Date => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Símbolos para tentar na Brapi: ações B3 podem precisar do sufixo .SA */
const getBrapiSymbolsToTry = (symbol: string): string[] => {
  const s = symbol.trim().toUpperCase();
  const isB3Stock = /^[A-Z0-9]{4,6}(3|4|11|34)$/.test(s) && !s.startsWith('^');
  if (isB3Stock && !s.endsWith('.SA')) {
    return [s, `${s}.SA`];
  }
  return [s];
};

/**
 * Busca preço mais recente de um ativo no banco.
 * Retorna null se não existir.
 */
export const getAssetPriceFromDb = async (symbol: string): Promise<number | null> => {
  if (!symbol?.trim()) return null;

  const normalized = symbol.trim().toUpperCase();

  const latest = await prisma.assetPriceHistory.findFirst({
    where: { symbol: normalized },
    orderBy: { date: 'desc' },
    select: { price: true },
  });

  return latest ? Number(latest.price) : null;
};

/**
 * Busca preço atual do Asset (currentPrice) se disponível.
 * Evita join com histórico quando o ativo já tem preço atualizado.
 */
export const getAssetCurrentPriceFromDb = async (symbol: string): Promise<number | null> => {
  if (!symbol?.trim()) return null;

  const asset = await prisma.asset.findUnique({
    where: { symbol: symbol.trim().toUpperCase() },
    select: { currentPrice: true },
  });

  return asset?.currentPrice ? Number(asset.currentPrice) : null;
};

/**
 * Busca preço de um ativo: banco → fallback BRAPI (1x) → salva no banco → retorna.
 */
export const getAssetPrice = async (
  symbol: string,
  options?: { useBrapiFallback?: boolean }
): Promise<number | null> => {
  if (!symbol?.trim()) return null;

  const useFallback = options?.useBrapiFallback !== false;
  const normalized = symbol.trim().toUpperCase();

  // 1) Tentar currentPrice do Asset (mais rápido)
  const fromAsset = await getAssetCurrentPriceFromDb(normalized);
  if (fromAsset !== null && fromAsset > 0) return fromAsset;

  // 2) Tentar histórico
  const fromHistory = await getAssetPriceFromDb(normalized);
  if (fromHistory !== null && fromHistory > 0) return fromHistory;

  // 3) Fallback BRAPI (apenas 1x)
  if (!useFallback) return null;

  const quotes = await fetchQuotes([normalized], false);
  const price = quotes.get(normalized) ?? null;

  if (price !== null && price > 0) {
    await persistPriceFromBrapi(normalized, price);
  }

  return price;
};

/**
 * Busca preços de múltiplos ativos: banco → fallback BRAPI apenas para os faltantes.
 */
export const getAssetPrices = async (
  symbols: string[],
  options?: { useBrapiFallback?: boolean }
): Promise<Map<string, number>> => {
  const result = new Map<string, number>();
  if (!symbols?.length) return result;

  const uniqueSymbols = [...new Set(symbols.filter((s) => s?.trim()))]
    .map((s) => s.trim().toUpperCase())
    .filter(
      (s) =>
        !s.startsWith('RESERVA-EMERG') &&
        !s.startsWith('RESERVA-OPORT') &&
        !s.startsWith('PERSONALIZADO')
    );

  if (uniqueSymbols.length === 0) return result;

  const useFallback = options?.useBrapiFallback !== false;

  // 1) Buscar do banco (Asset.currentPrice + AssetPriceHistory)
  const assetsWithPrice = await prisma.asset.findMany({
    where: { symbol: { in: uniqueSymbols } },
    select: { symbol: true, currentPrice: true },
  });

  for (const a of assetsWithPrice) {
    if (a.currentPrice && Number(a.currentPrice) > 0) {
      result.set(a.symbol, Number(a.currentPrice));
    }
  }

  const missingFromAsset = uniqueSymbols.filter((s) => !result.has(s));

  if (missingFromAsset.length > 0) {
    const fromHistory = await prisma.assetPriceHistory.findMany({
      where: { symbol: { in: missingFromAsset } },
      orderBy: { date: 'desc' },
      select: { symbol: true, price: true },
    });

    const latestBySymbol = new Map<string, number>();
    for (const h of fromHistory) {
      if (!latestBySymbol.has(h.symbol) && Number(h.price) > 0) {
        latestBySymbol.set(h.symbol, Number(h.price));
      }
    }
    latestBySymbol.forEach((v, k) => result.set(k, v));
  }

  const stillMissing = uniqueSymbols.filter((s) => !result.has(s));

  if (stillMissing.length > 0 && useFallback) {
    const quotes = await fetchQuotes(stillMissing, false);
    for (const symbol of stillMissing) {
      const price = quotes.get(symbol) ?? null;
      if (price !== null && price > 0) {
        result.set(symbol, price);
        await persistPriceFromBrapi(symbol, price);
      }
    }
  }

  return result;
};

/**
 * Persiste preço vindo da BRAPI no banco (histórico + atualização do Asset).
 */
export const persistPriceFromBrapi = async (
  symbol: string,
  price: number,
  options?: { currency?: string; marketDate?: Date }
): Promise<void> => {
  const marketDate = options?.marketDate ?? new Date();
  const dateNormalized = normalizeDateToDayStart(marketDate);

  const asset = await prisma.asset.findUnique({
    where: { symbol: symbol.trim().toUpperCase() },
    select: { id: true, currency: true },
  });

  if (!asset) return;

  const currency = options?.currency ?? asset.currency ?? null;

  const symbolUpper = symbol.trim().toUpperCase();

  await prisma.$transaction([
    prisma.assetPriceHistory.upsert({
      where: {
        symbol_date: { symbol: symbolUpper, date: dateNormalized },
      },
      update: { price: new Decimal(price) },
      create: {
        assetId: asset.id,
        symbol: symbolUpper,
        price: new Decimal(price),
        currency,
        source: 'BRAPI',
        date: dateNormalized,
      },
    }),
    prisma.asset.update({
      where: { id: asset.id },
      data: {
        currentPrice: new Decimal(price),
        priceUpdatedAt: marketDate,
      },
    }),
  ]);
};

/**
 * Busca histórico de preços de um ativo: banco primeiro, fallback BRAPI com persistência.
 * Quando o banco tem dados parciais (lacunas), busca na BRAPI para preencher e persiste.
 */
export const getAssetHistory = async (
  symbol: string,
  startDate: Date,
  endDate: Date,
  options?: { useBrapiFallback?: boolean }
): Promise<Array<{ date: number; value: number }>> => {
  if (!symbol?.trim()) return [];

  const normalized = symbol.trim().toUpperCase();
  const start = normalizeDateToDayStart(startDate);
  const end = normalizeDateToDayStart(endDate);

  const fromDb = await prisma.assetPriceHistory.findMany({
    where: {
      symbol: normalized,
      date: { gte: start, lte: end },
    },
    orderBy: { date: 'asc' },
    select: { date: true, price: true },
  });

  let data: Array<{ date: number; value: number }> = fromDb.map((r) => ({
    date: r.date.getTime(),
    value: Number(r.price),
  }));

  const useFallback = options?.useBrapiFallback !== false;
  const expectedDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
  const hasInsufficientData = data.length < expectedDays * 0.5;

  if (useFallback && (data.length === 0 || hasInsufficientData)) {
    const fromBrapi = await fetchAndPersistHistoryFromBrapi(normalized, start, end);
    if (fromBrapi.length > 0) {
      const byDate = new Map(data.map((d) => [d.date, d]));
      fromBrapi.forEach((d) => {
        if (!byDate.has(d.date)) byDate.set(d.date, d);
      });
      data = Array.from(byDate.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => v);
    }
  }

  return data;
};

/**
 * Busca histórico na BRAPI, persiste no banco e retorna.
 * Tenta múltiplos formatos de símbolo (ex: PETR4 e PETR4.SA para ações B3).
 */
const fetchAndPersistHistoryFromBrapi = async (
  symbol: string,
  startDate: Date,
  endDate: Date
): Promise<Array<{ date: number; value: number }>> => {
  const symbolsToTry = getBrapiSymbolsToTry(symbol);

  for (const brapiSymbol of symbolsToTry) {
    const data = await tryFetchHistoryFromBrapi(brapiSymbol, symbol, startDate, endDate);
    if (data.length > 0) return data;
  }

  return [];
};

const tryFetchHistoryFromBrapi = async (
  brapiSymbol: string,
  dbSymbol: string,
  startDate: Date,
  endDate: Date
): Promise<Array<{ date: number; value: number }>> => {
  try {
    const apiKey = process.env.BRAPI_API_KEY;
    const tokenParam = apiKey ? `&token=${apiKey}` : '';
    const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / DAY_MS);
    let brapiRange = '1y';
    if (daysSinceStart > 1825) brapiRange = '5y';
    else if (daysSinceStart > 730) brapiRange = '2y';

    const url = `https://brapi.dev/api/quote/${encodeURIComponent(brapiSymbol)}?range=${brapiRange}&interval=1d${tokenParam}`;
    const response = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });

    if (!response.ok) return [];

    const json = await response.json();
    const results = json?.results;
    if (!Array.isArray(results) || results.length === 0) return [];

    const result = results[0];
    const historicalData = result?.historicalDataPrice ?? [];
    if (!historicalData.length) return [];

    let asset = await prisma.asset.findUnique({
      where: { symbol: dbSymbol },
      select: { id: true, currency: true },
    });

    if (!asset && dbSymbol.startsWith('^')) {
      asset = await prisma.asset.upsert({
        where: { symbol: dbSymbol },
        create: {
          symbol: dbSymbol,
          name: dbSymbol === '^BVSP' ? 'IBOVESPA' : dbSymbol,
          type: 'index',
          currency: 'BRL',
          source: 'brapi',
        },
        update: {},
        select: { id: true, currency: true },
      });
    }

    if (!asset) return [];

    const toPersist: Array<{ date: Date; value: number }> = [];
    const data: Array<{ date: number; value: number }> = [];

    const startNorm = normalizeDateToDayStart(startDate);
    const endNorm = normalizeDateToDayStart(endDate);

    for (const item of historicalData) {
      const dateMs = (item.date ?? 0) * 1000;
      const value = item.close ?? 0;
      if (!Number.isFinite(value) || value <= 0) continue;

      const d = normalizeDateToDayStart(new Date(dateMs));
      toPersist.push({ date: d, value });
      if (d >= startNorm && d <= endNorm) {
        data.push({ date: d.getTime(), value });
      }
    }

    for (const p of toPersist) {
      await prisma.assetPriceHistory.upsert({
        where: { symbol_date: { symbol: dbSymbol, date: p.date } },
        update: { price: new Decimal(p.value) },
        create: {
          assetId: asset.id,
          symbol: dbSymbol,
          price: new Decimal(p.value),
          currency: asset.currency,
          source: 'BRAPI',
          date: p.date,
        },
      });
    }

    return data.sort((a, b) => a.date - b.date);
  } catch (err) {
    console.error(`[getAssetHistory] Erro ao buscar histórico de ${brapiSymbol}:`, err);
    return [];
  }
};
