"use client";
import React, { useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useIndices } from "@/hooks/useIndices";
import { useCarteira } from "@/hooks/useCarteira";
import { useCarteiraHistorico } from "@/hooks/useCarteiraHistorico";
import RentabilidadeChart from "./RentabilidadeChart";
import RentabilidadeResumo from "./RentabilidadeResumo";

type RentabilidadeRangeValue = "inicio" | "ano" | "12m" | "2y" | "3y" | "5y" | "10y";

const RENTABILIDADE_RANGE_OPTIONS: Array<{ value: RentabilidadeRangeValue; label: string }> = [
  { value: "inicio", label: "Do início" },
  { value: "ano", label: "No ano" },
  { value: "12m", label: "Últimos 12 meses" },
  { value: "2y", label: "Últimos 2 anos" },
  { value: "3y", label: "Últimos 3 anos" },
  { value: "5y", label: "Últimos 5 anos" },
  { value: "10y", label: "Últimos 10 anos" },
];

export default function RentabilidadeGeral() {
  const [selectedRange, setSelectedRange] = useState<RentabilidadeRangeValue>("inicio");
  const { resumo, loading: carteiraLoading } = useCarteira();

  const normalizeStartDate = (date: Date): number => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized.getTime();
  };

  const getRangeStartDate = (range: RentabilidadeRangeValue, firstDate?: number) => {
    const now = new Date();
    const normalizedNow = normalizeStartDate(now);

    if (range === "inicio") {
      return firstDate;
    }

    if (range === "ano") {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return normalizeStartDate(yearStart);
    }

    if (range === "12m") {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 12);
      return normalizeStartDate(start);
    }

    if (range === "2y") {
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 2);
      return normalizeStartDate(start);
    }

    if (range === "3y") {
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 3);
      return normalizeStartDate(start);
    }

    if (range === "5y") {
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 5);
      return normalizeStartDate(start);
    }

    if (range === "10y") {
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 10);
      return normalizeStartDate(start);
    }

    return normalizedNow;
  };

  // Calcular data do primeiro investimento (primeira data com valor não-zero do histórico)
  const firstInvestmentDate = useMemo(() => {
    if (!resumo?.historicoPatrimonio || resumo.historicoPatrimonio.length === 0) {
      return undefined;
    }
    // Encontrar o primeiro valor não-zero (ignorar pontos iniciais com valor zero)
    const firstNonZeroItem = resumo.historicoPatrimonio.find(item => item.valor > 0);
    return firstNonZeroItem?.data;
  }, [resumo?.historicoPatrimonio]);

  const selectedRangeStart = useMemo(() => {
    const rangeStart = getRangeStartDate(selectedRange, firstInvestmentDate);
    if (!rangeStart && firstInvestmentDate) {
      return firstInvestmentDate;
    }
    if (!rangeStart) {
      return undefined;
    }
    if (firstInvestmentDate) {
      return Math.max(rangeStart, firstInvestmentDate);
    }
    return rangeStart;
  }, [firstInvestmentDate, selectedRange]);

  // Buscar histórico diário da carteira baseado nos investimentos e histórico de preços
  const { data: carteiraHistoricoDiario, loading: loadingCarteiraHistorico, error: errorCarteiraHistorico } = useCarteiraHistorico(selectedRangeStart);

  // Calcular dados da carteira baseado no histórico de patrimônio (para períodos mensais e anuais)
  const carteiraDataMensal = useMemo(() => {
    if (!resumo?.historicoPatrimonio || resumo.historicoPatrimonio.length === 0) {
      return [];
    }

    const historico = resumo.historicoPatrimonio;
    
    // Encontrar o primeiro valor não-zero (ignorar pontos iniciais com valor zero)
    const firstNonZeroIndex = historico.findIndex(item => item.valor > 0);
    if (firstNonZeroIndex === -1) {
      return [];
    }
    
    const firstNonZeroItem = historico[firstNonZeroIndex];
    const firstValue = firstNonZeroItem.valor;
    const firstDate = firstNonZeroItem.data;
    
    // Limite: fim do dia atual (não mostrar dados futuros)
    const hoje = new Date();
    hoje.setHours(23, 59, 59, 999);
    const hojeTimestamp = hoje.getTime();

    // Filtrar apenas os pontos a partir do primeiro valor não-zero e até o dia atual
    return historico
      .filter(item => item.data >= firstDate && item.data <= hojeTimestamp)
      .map(item => ({
        date: item.data,
        value: ((item.valor - firstValue) / firstValue) * 100,
      }));
  }, [resumo?.historicoPatrimonio]);

  // Buscar dados para os 3 períodos simultaneamente
  // Para os períodos "1d" e "1mo", passar a data do primeiro investimento
  const { indices: indices1d, loading: loading1d, error: error1d } = useIndices("1d", selectedRangeStart);
  const { indices: indices1mo, loading: loading1mo, error: error1mo } = useIndices("1mo", selectedRangeStart);
  const { indices: indices1y, loading: loading1y, error: error1y } = useIndices("1y", selectedRangeStart);

  const filterDataByStart = <T extends { date: number }>(data: T[], startDate?: number) => {
    if (!startDate) {
      return data;
    }
    return data.filter((item) => item.date >= startDate);
  };

  const filteredCarteiraHistorico = useMemo(
    () => filterDataByStart(carteiraHistoricoDiario, selectedRangeStart),
    [carteiraHistoricoDiario, selectedRangeStart]
  );

  const filteredIndices1d = useMemo(
    () =>
      indices1d.map((index) => ({
        ...index,
        data: filterDataByStart(index.data, selectedRangeStart),
      })),
    [indices1d, selectedRangeStart]
  );

  const filteredIndices1mo = useMemo(
    () =>
      indices1mo.map((index) => ({
        ...index,
        data: filterDataByStart(index.data, selectedRangeStart),
      })),
    [indices1mo, selectedRangeStart]
  );

  const filteredIndices1y = useMemo(
    () =>
      indices1y.map((index) => ({
        ...index,
        data: filterDataByStart(index.data, selectedRangeStart),
      })),
    [indices1y, selectedRangeStart]
  );

  const handleRangeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedRange(event.target.value as RentabilidadeRangeValue);
  };

  const loading = loading1d || loading1mo || loading1y || carteiraLoading || loadingCarteiraHistorico;
  const error = error1d || error1mo || error1y || errorCarteiraHistorico;

  if (loading) {
    return <LoadingSpinner text="Carregando dados de rentabilidade..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
            Erro ao carregar dados
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <div className="w-full max-w-[220px]">
          <label htmlFor="rentabilidade-range" className="sr-only">
            Filtro de período
          </label>
          <select
            id="rentabilidade-range"
            aria-label="Filtro de período"
            value={selectedRange}
            onChange={handleRangeChange}
            className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-10 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {RENTABILIDADE_RANGE_OPTIONS.map((option) => (
              <option
                key={option.value}
                value={option.value}
                className="text-gray-700 dark:bg-gray-900 dark:text-gray-400"
              >
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Gráficos à esquerda */}
      <div className="lg:col-span-2 space-y-6">
        {/* Gráfico Por Dia - usar histórico diário baseado em investimentos */}
        <ComponentCard title="Rentabilidade Por Dia">
          <RentabilidadeChart
            carteiraData={filteredCarteiraHistorico}
            indicesData={filteredIndices1d}
            period="1d"
          />
        </ComponentCard>

        {/* Gráfico Por Mês - usar histórico diário (será agrupado por mês no chart) */}
        <ComponentCard title="Rentabilidade Por Mês">
          <RentabilidadeChart
            carteiraData={filteredCarteiraHistorico}
            indicesData={filteredIndices1mo}
            period="1mo"
          />
        </ComponentCard>

        {/* Gráfico Por Ano - usar histórico diário (será agrupado por ano no chart) */}
        <ComponentCard title="Rentabilidade Por Ano">
          <RentabilidadeChart
            carteiraData={filteredCarteiraHistorico}
            indicesData={filteredIndices1y}
            period="1y"
          />
        </ComponentCard>
      </div>

      {/* Resumo de Rentabilidade à direita */}
        <div className="lg:col-span-1">
          <RentabilidadeResumo />
        </div>
      </div>
    </div>
  );
}

