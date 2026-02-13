"use client";
import React, { useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useIndices, IndexData } from "@/hooks/useIndices";
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

    let calculatedStart: number | undefined;

    if (range === "ano") {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      calculatedStart = normalizeStartDate(yearStart);
    } else if (range === "12m") {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 12);
      calculatedStart = normalizeStartDate(start);
    } else if (range === "2y") {
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 2);
      calculatedStart = normalizeStartDate(start);
    } else if (range === "3y") {
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 3);
      calculatedStart = normalizeStartDate(start);
    } else if (range === "5y") {
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 5);
      calculatedStart = normalizeStartDate(start);
    } else if (range === "10y") {
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 10);
      calculatedStart = normalizeStartDate(start);
    } else {
      calculatedStart = normalizedNow;
    }

    // Se temos uma data de início da carteira e o range calculado é anterior a ela,
    // usar a data de início da carteira como limite mínimo
    if (firstDate && calculatedStart && calculatedStart < firstDate) {
      return firstDate;
    }

    return calculatedStart;
  };

  // Calcular data do primeiro investimento (primeira data com valor não-zero do histórico)
  const firstInvestmentDate = useMemo(() => {
    if (!resumo?.historicoPatrimonio || resumo.historicoPatrimonio.length === 0) {
      return undefined;
    }
    // Encontrar o primeiro valor não-zero (ignorar pontos iniciais com valor zero)
    const firstNonZeroItem = resumo.historicoPatrimonio.find(
      item => item.saldoBruto > 0 || item.valorAplicado > 0
    );
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

  // Buscar histórico diário da carteira - fallback quando historicoPatrimonio não está disponível
  const { data: carteiraHistoricoDiario, loading: loadingCarteiraHistorico, error: errorCarteiraHistorico } = useCarteiraHistorico(selectedRangeStart);

  // Dados da carteira para o gráfico: priorizar historicoPatrimonio (resumo) pois inclui
  // renda fixa, reservas e ativos manuais corretamente. Fallback para carteira-historico API.
  const carteiraHistoricoParaChart = useMemo(() => {
    if (resumo?.historicoPatrimonio && resumo.historicoPatrimonio.length > 0) {
      const historico = resumo.historicoPatrimonio;
      const firstNonZeroIndex = historico.findIndex(
        item => item.saldoBruto > 0 || item.valorAplicado > 0
      );
      if (firstNonZeroIndex === -1) return [];
      const firstNonZeroItem = historico[firstNonZeroIndex];
      const firstValue = firstNonZeroItem.saldoBruto;
      const firstDate = firstNonZeroItem.data;
      const hoje = new Date();
      hoje.setHours(23, 59, 59, 999);
      const hojeTimestamp = hoje.getTime();
      return historico
        .filter(item => item.data >= firstDate && item.data <= hojeTimestamp)
        .map(item => ({
          date: item.data,
          value: ((item.saldoBruto - firstValue) / firstValue) * 100,
        }));
    }
    return carteiraHistoricoDiario || [];
  }, [resumo?.historicoPatrimonio, carteiraHistoricoDiario]);

  // Range dos índices deve cobrir o período selecionado para evitar dados incompletos
  const indicesDailyRange = useMemo(() => {
    if (selectedRange === "12m") return "1y";
    if (selectedRange === "2y") return "2y";
    if (selectedRange === "3y" || selectedRange === "5y" || selectedRange === "10y") return "2y";
    if (selectedRange === "ano") return "1y";
    return "1y"; // "inicio" e default: 1y (indices API expande conforme startDate)
  }, [selectedRange]);
  // Para os períodos "1d" e "1mo", passar a data do primeiro investimento
  const { indices: indices1d, loading: loading1d, error: error1d } = useIndices(indicesDailyRange, selectedRangeStart);
  const { indices: indices1mo, loading: loading1mo, error: error1mo } = useIndices("1mo", selectedRangeStart);
  const { indices: indices1y, loading: loading1y, error: error1y } = useIndices("1y", selectedRangeStart);

  const filterDataByStart = <T extends { date: number }>(data: T[], startDate?: number): T[] => {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }
    if (!startDate) {
      return data;
    }
    // Filtrar dados a partir da data de início
    const filtered = data.filter((item) => item && typeof item.date === 'number' && item.date >= startDate);
    
    // Se não há dados a partir da data solicitada, retornar todos os dados disponíveis
    // (mostrar dados a partir do início real quando não há dados mais antigos)
    if (filtered.length === 0) {
      return data;
    }
    
    return filtered;
  };

  const rebaseToStart = (data: IndexData[]): IndexData[] => {
    if (!Array.isArray(data) || data.length === 0) return data;
    
    // Encontrar o primeiro valor não-zero para usar como base
    let baseValue = 0;
    let baseItem: IndexData | null = null;
    
    for (const item of data) {
      if (item && typeof item.value === 'number' && Number.isFinite(item.value) && item.value !== 0) {
        baseValue = item.value;
        baseItem = item;
        break;
      }
    }
    
    if (baseValue === 0 || !baseItem) return data;

    return data.map((item) => ({
      ...item,
      value: item.value - baseValue,
    }));
  };

  const filteredCarteiraHistorico = useMemo(() => {
    if (!Array.isArray(carteiraHistoricoParaChart) || carteiraHistoricoParaChart.length === 0) {
      return [];
    }
    const filtered = filterDataByStart(carteiraHistoricoParaChart, selectedRangeStart);
    if (filtered.length === 0) return [];
    return rebaseToStart(filtered);
  }, [carteiraHistoricoParaChart, selectedRangeStart]);

  const filteredIndices1d = useMemo(
    () =>
      Array.isArray(indices1d)
        ? indices1d
            .filter(index => index && Array.isArray(index.data) && index.data.length > 0)
            .map((index) => ({
              ...index,
              data: filterDataByStart(index.data, selectedRangeStart),
            }))
            .filter(index => Array.isArray(index.data) && index.data.length > 0)
        : [],
    [indices1d, selectedRangeStart]
  );

  const filteredIndices1mo = useMemo(
    () =>
      Array.isArray(indices1mo)
        ? indices1mo
            .filter(index => index && Array.isArray(index.data) && index.data.length > 0)
            .map((index) => ({
              ...index,
              data: filterDataByStart(index.data, selectedRangeStart),
            }))
            .filter(index => Array.isArray(index.data) && index.data.length > 0)
        : [],
    [indices1mo, selectedRangeStart]
  );

  const filteredIndices1y = useMemo(
    () =>
      Array.isArray(indices1y)
        ? indices1y
            .filter(index => index && Array.isArray(index.data) && index.data.length > 0)
            .map((index) => ({
              ...index,
              data: filterDataByStart(index.data, selectedRangeStart),
            }))
            .filter(index => Array.isArray(index.data) && index.data.length > 0)
        : [],
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

