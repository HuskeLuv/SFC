/**
 * Serviço para indicadores de mercado (IBOV, Dólar, BTC, ETH).
 * Regra: banco primeiro, fallback BRAPI quando cache expirado (> 15 min).
 */

import prisma from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos

export type IndicatorValue = {
  price: number | null;
  changePercent: number | null;
};

const getIndicatorFromCache = async (
  indicatorKey: string
): Promise<IndicatorValue | null> => {
  const row = await prisma.marketIndicatorCache.findUnique({
    where: { indicatorKey },
  });
  if (!row) return null;

  const ageMs = Date.now() - row.updatedAt.getTime();
  if (ageMs > CACHE_TTL_MS) return null;

  return {
    price: Number(row.price),
    changePercent: row.changePercent != null ? Number(row.changePercent) : null,
  };
};

const persistIndicator = async (
  indicatorKey: string,
  price: number,
  changePercent: number | null
): Promise<void> => {
  await prisma.marketIndicatorCache.upsert({
    where: { indicatorKey },
    update: {
      price: new Decimal(price),
      changePercent: changePercent != null ? new Decimal(changePercent) : null,
      updatedAt: new Date(),
    },
    create: {
      indicatorKey,
      price: new Decimal(price),
      changePercent: changePercent != null ? new Decimal(changePercent) : null,
      updatedAt: new Date(),
    },
  });
};

const fetchBrapiQuote = async (symbol: string): Promise<IndicatorValue> => {
  try {
    const apiKey = process.env.BRAPI_API_KEY;
    const tokenParam = apiKey ? `&token=${apiKey}` : '';
    const url = `https://brapi.dev/api/quote/${symbol}?range=1d&interval=1d${tokenParam}`;

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      cache: 'no-store',
    });

    if (!response.ok) return { price: null, changePercent: null };

    const data = await response.json();
    const result = Array.isArray(data?.results) ? data.results[0] : null;
    const priceFromQuote = result?.regularMarketPrice ?? null;
    const changePercent = result?.regularMarketChangePercent ?? null;

    if (priceFromQuote !== null && Number.isFinite(priceFromQuote)) {
      return { price: priceFromQuote, changePercent };
    }

    const historical = Array.isArray(result?.historicalDataPrice)
      ? result.historicalDataPrice
      : [];
    const lastClose =
      historical.length > 0 ? historical[historical.length - 1]?.close : null;
    const price = Number.isFinite(lastClose) ? lastClose : null;
    return { price, changePercent };
  } catch (error) {
    console.error('[marketIndicatorService] Erro ao buscar cotação:', symbol, error);
    return { price: null, changePercent: null };
  }
};

const fetchCurrencyQuote = async (currency: string): Promise<IndicatorValue> => {
  try {
    const apiKey = process.env.BRAPI_API_KEY;
    const tokenParam = apiKey ? `&token=${apiKey}` : '';
    const url = `https://brapi.dev/api/v2/currency?currency=${currency}${tokenParam}`;

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      cache: 'no-store',
    });

    if (!response.ok) return { price: null, changePercent: null };

    const data = await response.json();
    const result = Array.isArray(data?.currency) ? data.currency[0] : null;
    const bidPrice = result?.bidPrice ?? result?.bid;
    const askPrice = result?.askPrice ?? result?.ask;
    const price = Number.isFinite(bidPrice)
      ? bidPrice
      : Number.isFinite(askPrice)
        ? askPrice
        : Number.isFinite(parseFloat(String(bidPrice)))
          ? parseFloat(String(bidPrice))
          : Number.isFinite(parseFloat(String(askPrice)))
            ? parseFloat(String(askPrice))
            : null;
    const percentageChange = result?.percentageChange ?? result?.changePercent;
    const changePercent = Number.isFinite(percentageChange)
      ? percentageChange
      : Number.isFinite(parseFloat(String(percentageChange)))
        ? parseFloat(String(percentageChange))
        : null;

    return { price, changePercent };
  } catch (error) {
    console.error(
      '[marketIndicatorService] Erro ao buscar moeda:',
      currency,
      error
    );
    return { price: null, changePercent: null };
  }
};

const fetchCryptoQuotes = async (): Promise<Record<string, IndicatorValue>> => {
  const apiKey = process.env.BRAPI_API_KEY;
  if (!apiKey) return {};

  try {
    const url = `https://brapi.dev/api/v2/crypto?coin=BTC,ETH&currency=BRL&token=${apiKey}`;
    const response = await fetch(url, {
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      cache: 'no-store',
    });
    if (!response.ok) return {};
    const data = await response.json();
    const coins = Array.isArray(data?.coins) ? data.coins : [];
    const result: Record<string, IndicatorValue> = {};

    coins.forEach((coin: { coin?: string; symbol?: string; regularMarketPrice?: number; price?: number; regularMarketChangePercent?: number; change_percentage_24h?: number }) => {
      const symbol = String(coin?.coin ?? coin?.symbol ?? '').toUpperCase();
      if (!symbol) return;
      const price = Number.isFinite(coin?.regularMarketPrice)
        ? coin.regularMarketPrice
        : Number.isFinite(coin?.price)
          ? coin.price
          : null;
      const changePercent = Number.isFinite(coin?.regularMarketChangePercent)
        ? coin.regularMarketChangePercent
        : Number.isFinite(coin?.change_percentage_24h)
          ? coin.change_percentage_24h
          : null;
      result[symbol] = { price: price ?? null, changePercent: changePercent ?? null };
    });

    return result;
  } catch (error) {
    console.error('[marketIndicatorService] Erro ao buscar criptos:', error);
    return {};
  }
};

/**
 * Busca indicador: banco primeiro, fallback BRAPI, persiste no banco.
 */
export const getIndicator = async (
  indicatorKey: string,
  options?: { useBrapiFallback?: boolean }
): Promise<IndicatorValue> => {
  const useFallback = options?.useBrapiFallback !== false;

  const cached = await getIndicatorFromCache(indicatorKey);
  if (cached !== null && cached.price !== null && cached.price > 0) {
    return cached;
  }

  if (!useFallback) return { price: null, changePercent: null };

  let value: IndicatorValue = { price: null, changePercent: null };

  if (indicatorKey === 'IBOV') {
    value = await fetchBrapiQuote('^BVSP');
  } else if (indicatorKey === 'USD-BRL') {
    value = await fetchCurrencyQuote('USD-BRL');
  } else if (indicatorKey === 'BTC' || indicatorKey === 'ETH') {
    const crypto = await fetchCryptoQuotes();
    value = crypto[indicatorKey] ?? { price: null, changePercent: null };
  }

  if (value.price !== null && value.price > 0) {
    await persistIndicator(indicatorKey, value.price, value.changePercent);
  }

  return value;
};

/**
 * Busca todos os indicadores da carteira em paralelo: IBOV, Dólar, BTC, ETH.
 */
export const getAllIndicators = async (options?: {
  useBrapiFallback?: boolean;
}): Promise<{
  ibov: IndicatorValue;
  dolar: IndicatorValue;
  bitcoin: IndicatorValue;
  ethereum: IndicatorValue;
}> => {
  const useFallback = options?.useBrapiFallback !== false;

  const [ibov, dolar, btc, eth] = await Promise.all([
    getIndicator('IBOV', { useBrapiFallback: useFallback }),
    getIndicator('USD-BRL', { useBrapiFallback: useFallback }),
    getIndicator('BTC', { useBrapiFallback: useFallback }),
    getIndicator('ETH', { useBrapiFallback: useFallback }),
  ]);

  return {
    ibov,
    dolar,
    bitcoin: btc,
    ethereum: eth,
  };
};
