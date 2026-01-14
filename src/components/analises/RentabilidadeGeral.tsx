"use client";
import React, { useMemo } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useIndices } from "@/hooks/useIndices";
import { useCarteira } from "@/hooks/useCarteira";
import { useCarteiraHistorico } from "@/hooks/useCarteiraHistorico";
import RentabilidadeChart from "./RentabilidadeChart";
import RentabilidadeResumo from "./RentabilidadeResumo";

const PERIOD_OPTIONS = [
  { value: "1d", label: "Por Dia" },
  { value: "1mo", label: "Por Mês" },
  { value: "1y", label: "Por Ano" },
] as const;

export default function RentabilidadeGeral() {
  const { resumo, loading: carteiraLoading } = useCarteira();

  // Calcular data do primeiro investimento (primeira data com valor não-zero do histórico)
  const firstInvestmentDate = useMemo(() => {
    if (!resumo?.historicoPatrimonio || resumo.historicoPatrimonio.length === 0) {
      return undefined;
    }
    // Encontrar o primeiro valor não-zero (ignorar pontos iniciais com valor zero)
    const firstNonZeroItem = resumo.historicoPatrimonio.find(item => item.valor > 0);
    return firstNonZeroItem?.data;
  }, [resumo?.historicoPatrimonio]);

  // Buscar histórico diário da carteira baseado nos investimentos e histórico de preços
  const { data: carteiraHistoricoDiario, loading: loadingCarteiraHistorico, error: errorCarteiraHistorico } = useCarteiraHistorico(firstInvestmentDate);

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
  const { indices: indices1d, loading: loading1d, error: error1d } = useIndices("1d", firstInvestmentDate);
  const { indices: indices1mo, loading: loading1mo, error: error1mo } = useIndices("1mo", firstInvestmentDate);
  const { indices: indices1y, loading: loading1y, error: error1y } = useIndices("1y");

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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Gráficos à esquerda */}
      <div className="lg:col-span-2 space-y-6">
        {/* Gráfico Por Dia - usar histórico diário baseado em investimentos */}
        <ComponentCard title="Rentabilidade Por Dia">
          <RentabilidadeChart
            carteiraData={carteiraHistoricoDiario}
            indicesData={indices1d}
            period="1d"
          />
        </ComponentCard>

        {/* Gráfico Por Mês - usar histórico diário (será agrupado por mês no chart) */}
        <ComponentCard title="Rentabilidade Por Mês">
          <RentabilidadeChart
            carteiraData={carteiraHistoricoDiario}
            indicesData={indices1mo}
            period="1mo"
          />
        </ComponentCard>

        {/* Gráfico Por Ano - usar histórico diário (será agrupado por ano no chart) */}
        <ComponentCard title="Rentabilidade Por Ano">
          <RentabilidadeChart
            carteiraData={carteiraHistoricoDiario}
            indicesData={indices1y}
            period="1y"
          />
        </ComponentCard>
      </div>

      {/* Resumo de Rentabilidade à direita */}
      <div className="lg:col-span-1">
        <RentabilidadeResumo />
      </div>
    </div>
  );
}

