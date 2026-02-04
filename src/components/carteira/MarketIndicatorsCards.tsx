import React, { useEffect, useMemo, useState } from "react";
import MetricCard from "./shared/MetricCard";

type IndicatorValue = {
  price: number | null;
  changePercent: number | null;
};

type IndicatorsResponse = {
  indicators: {
    ibov: IndicatorValue;
    dolar: IndicatorValue;
    bitcoin: IndicatorValue;
    ethereum: IndicatorValue;
  };
};

const formatCurrency = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
};

const formatIbov = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }
  return value.toLocaleString("pt-BR", {
    maximumFractionDigits: 0,
  });
};

const formatChange = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

export default function MarketIndicatorsCards() {
  const [data, setData] = useState<IndicatorsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchIndicators = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/analises/indicadores");
        if (!response.ok) {
          throw new Error("Erro ao buscar indicadores");
        }
        const result = (await response.json()) as IndicatorsResponse;
        if (isMounted) {
          setData(result);
        }
      } catch (error) {
        console.error(error);
        if (isMounted) {
          setData(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void fetchIndicators();
    return () => {
      isMounted = false;
    };
  }, []);

  const cards = useMemo(
    () => {
    const indicators = data?.indicators;
    const ibovChange = indicators?.ibov.changePercent ?? null;
    const dolarChange = indicators?.dolar.changePercent ?? null;
    const bitcoinChange = indicators?.bitcoin.changePercent ?? null;
    const ethereumChange = indicators?.ethereum.changePercent ?? null;
      return [
      {
        title: "IBOV",
        value: loading ? "--" : formatIbov(indicators?.ibov.price ?? null),
        change: loading ? "--" : formatChange(ibovChange),
        changeDirection: (ibovChange ?? 0) < 0 ? "down" : "up",
        color: "primary" as const,
      },
      {
        title: "Dólar Comercial",
        value: loading ? "--" : formatCurrency(indicators?.dolar.price ?? null),
        change: loading ? "--" : formatChange(dolarChange),
        changeDirection: (dolarChange ?? 0) < 0 ? "down" : "up",
        color: "warning" as const,
      },
      {
        title: "Bitcoin",
        value: loading ? "--" : formatCurrency(indicators?.bitcoin.price ?? null),
        change: loading ? "--" : formatChange(bitcoinChange),
        changeDirection: (bitcoinChange ?? 0) < 0 ? "down" : "up",
        color: "success" as const,
      },
      {
        title: "Ethereum",
        value: loading ? "--" : formatCurrency(indicators?.ethereum.price ?? null),
        change: loading ? "--" : formatChange(ethereumChange),
        changeDirection: (ethereumChange ?? 0) < 0 ? "down" : "up",
        color: "primary" as const,
      },
      ] as Array<{
        title: string;
        value: string;
        change: string;
        changeDirection: "up" | "down";
        color: "primary" | "success" | "warning" | "error";
      }>;
    },
    [data, loading]
  );

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <MetricCard
          key={card.title}
          title={card.title}
          value={card.value}
          color={card.color}
          change={card.change}
          changeDirection={card.changeDirection}
        />
      ))}
    </div>
  );
}
