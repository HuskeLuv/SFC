/**
 * Serviço centralizado para leitura de preços de ativos.
 * Regra: banco primeiro, fallback BRAPI apenas quando necessário.
 * Nunca consultar BRAPI diretamente no frontend.
 */

import prisma from '@/lib/prisma';
import { fetchQuotes, fetchCryptoQuotes, fetchCurrencyQuotes } from '@/services/brapiQuote';
import { Decimal } from '@prisma/client/runtime/library';

const normalizeDateToDayStart = (date: Date): Date => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const today = (): Date => normalizeDateToDayStart(new Date());

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

  const normalized = symbol.trim().toUpperCase();
  if (normalized.startsWith('RESERVA-EMERG') || normalized.startsWith('RESERVA-OPORT') ||
      normalized.startsWith('RENDA-FIXA') || normalized.startsWith('CONTA-CORRENTE') || normalized.startsWith('PERSONALIZADO') ||
      normalized.startsWith('DEBENTURE-') || normalized.startsWith('FUNDO-') ||
      /-\d{13}-/.test(normalized) ||
      normalized.startsWith('-') || /^\d/.test(normalized)) {
    return null;
  }

  const useFallback = options?.useBrapiFallback !== false;
  const todayDate = today();

  // 1) Tentar currentPrice do Asset se priceUpdatedAt for de hoje
  const asset = await prisma.asset.findUnique({
    where: { symbol: normalized },
    select: { currentPrice: true, priceUpdatedAt: true, type: true, currency: true, source: true },
  });
  const isManualAsset = asset?.source === 'manual';
  const effectiveUseFallback = useFallback && !isManualAsset;
  if (asset?.currentPrice && Number(asset.currentPrice) > 0 && asset.priceUpdatedAt) {
    const updatedAt = normalizeDateToDayStart(asset.priceUpdatedAt);
    if (updatedAt.getTime() === todayDate.getTime()) {
      return Number(asset.currentPrice);
    }
  }

  // 2) Tentar histórico - apenas se a data mais recente for de hoje
  const latestHistory = await prisma.assetPriceHistory.findFirst({
    where: { symbol: normalized },
    orderBy: { date: 'desc' },
    select: { price: true, date: true },
  });
  if (latestHistory && Number(latestHistory.price) > 0) {
    const histDate = normalizeDateToDayStart(latestHistory.date);
    if (histDate.getTime() === todayDate.getTime()) {
      return Number(latestHistory.price);
    }
  }

  // 3) Fallback BRAPI (buscar e persistir) - nunca para ativos manuais
  if (!effectiveUseFallback) return null;

  let price: number | null = null;
  if (asset?.type === 'crypto') {
    // Criptoativos são adicionados em reais - sempre buscar cotação em BRL
    const cryptoQuotes = await fetchCryptoQuotes([normalized], 'BRL');
    price = cryptoQuotes.get(normalized) ?? null;
  }
  if (price === null && asset?.type === 'currency') {
    const currencyQuotes = await fetchCurrencyQuotes([normalized]);
    price = currencyQuotes.get(normalized) ?? null;
  }
  if (price === null) {
    const quotes = await fetchQuotes([normalized], false);
    price = quotes.get(normalized) ?? null;
  }

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
        !s.startsWith('RENDA-FIXA') &&
        !s.startsWith('CONTA-CORRENTE') &&
        !s.startsWith('PERSONALIZADO') &&
        !s.startsWith('DEBENTURE-') &&
        !s.startsWith('FUNDO-') &&
        !/-\d{13}-/.test(s) &&
        !s.startsWith('-') &&
        /^[A-Za-z]/.test(s)
    );

  if (uniqueSymbols.length === 0) return result;

  const useFallback = options?.useBrapiFallback !== false;
  const todayDate = today();

  // 1) Buscar do banco - usar apenas se tiver valor do dia (priceUpdatedAt ou history.date = hoje)
  const assetsWithPrice = await prisma.asset.findMany({
    where: { symbol: { in: uniqueSymbols } },
    select: { symbol: true, currentPrice: true, priceUpdatedAt: true },
  });

  const historyRows = await prisma.assetPriceHistory.findMany({
    where: { symbol: { in: uniqueSymbols } },
    orderBy: { date: 'desc' },
    select: { symbol: true, price: true, date: true },
  });
  const latestHistoryBySymbol = new Map<string, { price: number; date: Date }>();
  for (const h of historyRows) {
    if (!latestHistoryBySymbol.has(h.symbol) && Number(h.price) > 0) {
      latestHistoryBySymbol.set(h.symbol, { price: Number(h.price), date: h.date });
    }
  }

  for (const a of assetsWithPrice) {
    if (!a.currentPrice || Number(a.currentPrice) <= 0) continue;
    const price = Number(a.currentPrice);
    const assetUpdatedAt = a.priceUpdatedAt ? normalizeDateToDayStart(a.priceUpdatedAt) : null;
    const historyLatest = latestHistoryBySymbol.get(a.symbol);
    const hasTodayPrice =
      (assetUpdatedAt && assetUpdatedAt.getTime() === todayDate.getTime()) ||
      (historyLatest && normalizeDateToDayStart(historyLatest.date).getTime() === todayDate.getTime());
    if (hasTodayPrice) {
      result.set(a.symbol, price);
    }
  }

  for (const symbol of uniqueSymbols) {
    if (result.has(symbol)) continue;
    const latest = latestHistoryBySymbol.get(symbol);
    if (latest && latest.price > 0) {
      const latestDateNorm = normalizeDateToDayStart(latest.date);
      if (latestDateNorm.getTime() === todayDate.getTime()) {
        result.set(symbol, latest.price);
      }
    }
  }

  const stillMissing = uniqueSymbols.filter((s) => !result.has(s));

  if (stillMissing.length > 0 && useFallback) {
    const assetsForMissing = await prisma.asset.findMany({
      where: { symbol: { in: stillMissing } },
      select: { symbol: true, type: true, currency: true, source: true },
    });
    const assetBySymbol = new Map(assetsForMissing.map((a) => [a.symbol.toUpperCase(), a]));

    const cryptoSymbols = stillMissing.filter(
      (s) => assetBySymbol.get(s)?.type === 'crypto' && assetBySymbol.get(s)?.source !== 'manual'
    );
    const currencySymbols = stillMissing.filter(
      (s) => assetBySymbol.get(s)?.type === 'currency' && assetBySymbol.get(s)?.source !== 'manual'
    );
    const nonCryptoCurrencySymbols = stillMissing.filter(
      (s) => assetBySymbol.get(s)?.type !== 'crypto' &&
        assetBySymbol.get(s)?.type !== 'currency' &&
        assetBySymbol.get(s)?.source !== 'manual'
    );

    if (cryptoSymbols.length > 0) {
      // Criptoativos são adicionados em reais (BRL) - sempre buscar cotação em BRL para conversão correta
      const cryptoQuotes = await fetchCryptoQuotes(cryptoSymbols, 'BRL');
      for (const symbol of cryptoSymbols) {
        const price = cryptoQuotes.get(symbol) ?? null;
        if (price !== null && price > 0) {
          result.set(symbol, price);
          await persistPriceFromBrapi(symbol, price, { currency: 'BRL' });
        }
      }
    }

    if (currencySymbols.length > 0) {
      const currencyQuotes = await fetchCurrencyQuotes(currencySymbols);
      for (const symbol of currencySymbols) {
        const price = currencyQuotes.get(symbol) ?? null;
        if (price !== null && price > 0) {
          result.set(symbol, price);
          await persistPriceFromBrapi(symbol, price, { currency: 'BRL' });
        }
      }
    }

    if (nonCryptoCurrencySymbols.length > 0) {
      const quotes = await fetchQuotes(nonCryptoCurrencySymbols, false);
      for (const symbol of nonCryptoCurrencySymbols) {
        const price = quotes.get(symbol) ?? null;
        if (price !== null && price > 0) {
          result.set(symbol, price);
          await persistPriceFromBrapi(symbol, price);
        }
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
  if (normalized.startsWith('RESERVA-EMERG') || normalized.startsWith('RESERVA-OPORT') ||
      normalized.startsWith('RENDA-FIXA') || normalized.startsWith('CONTA-CORRENTE') || normalized.startsWith('PERSONALIZADO') ||
      normalized.startsWith('DEBENTURE-') || normalized.startsWith('FUNDO-') ||
      /-\d{13}-/.test(normalized) ||
      normalized.startsWith('-') || /^\d/.test(normalized)) {
    return [];
  }
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
