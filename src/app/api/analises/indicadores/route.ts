import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithActing } from "@/utils/auth";

type IndicatorValue = {
  price: number | null;
  changePercent: number | null;
};

const fetchBrapiQuote = async (symbol: string): Promise<IndicatorValue> => {
  try {
    const apiKey = process.env.BRAPI_API_KEY;
    const tokenParam = apiKey ? `&token=${apiKey}` : "";
    const url = `https://brapi.dev/api/quote/${symbol}?range=1d&interval=1d${tokenParam}`;

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return { price: null, changePercent: null };
    }

    const data = await response.json();
    const result = Array.isArray(data?.results) ? data.results[0] : null;
    const priceFromQuote = result?.regularMarketPrice ?? null;
    const changePercent = result?.regularMarketChangePercent ?? null;

    if (priceFromQuote !== null && Number.isFinite(priceFromQuote)) {
      return { price: priceFromQuote, changePercent };
    }

    const historical = Array.isArray(result?.historicalDataPrice) ? result.historicalDataPrice : [];
    const lastClose = historical.length > 0 ? historical[historical.length - 1]?.close : null;
    const price = Number.isFinite(lastClose) ? lastClose : null;
    return { price, changePercent };
  } catch (error) {
    console.error("Erro ao buscar cotação:", symbol, error);
    return { price: null, changePercent: null };
  }
};

const fetchCurrencyQuote = async (currency: string): Promise<IndicatorValue> => {
  try {
    const apiKey = process.env.BRAPI_API_KEY;
    const tokenParam = apiKey ? `&token=${apiKey}` : "";
    const url = `https://brapi.dev/api/v2/currency?currency=${currency}${tokenParam}`;

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return { price: null, changePercent: null };
    }

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
    console.error("Erro ao buscar moeda:", currency, error);
    return { price: null, changePercent: null };
  }
};

const fetchCryptoQuotes = async (): Promise<Record<string, IndicatorValue>> => {
  const apiKey = process.env.BRAPI_API_KEY;
  if (!apiKey) {
    return {};
  }

  try {
    const url = `https://brapi.dev/api/v2/crypto?coin=BTC,ETH&currency=BRL&token=${apiKey}`;
    const response = await fetch(url, {
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return {};
    }
    const data = await response.json();
    const coins = Array.isArray(data?.coins) ? data.coins : [];
    const result: Record<string, IndicatorValue> = {};

    coins.forEach((coin: any) => {
      const symbol = String(coin?.coin ?? coin?.symbol ?? "").toUpperCase();
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
      result[symbol] = { price, changePercent };
    });

    return result;
  } catch (error) {
    console.error("Erro ao buscar criptos:", error);
    return {};
  }
};

export async function GET(request: NextRequest) {
  try {
    await requireAuthWithActing(request);

    const [ibov, dolar, crypto] = await Promise.all([
      fetchBrapiQuote("^BVSP"),
      fetchCurrencyQuote("USD-BRL"),
      fetchCryptoQuotes(),
    ]);

    return NextResponse.json({
      indicators: {
        ibov,
        dolar,
        bitcoin: crypto.BTC || { price: null, changePercent: null },
        ethereum: crypto.ETH || { price: null, changePercent: null },
      },
    });
  } catch (error) {
    console.error("Erro ao buscar indicadores:", error);
    return NextResponse.json(
      { error: "Erro ao buscar indicadores" },
      { status: 500 }
    );
  }
}
