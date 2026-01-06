"use client";
import React, { useMemo } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useIndices } from "@/hooks/useIndices";
import { useCarteira } from "@/hooks/useCarteira";
import RentabilidadeChart from "./RentabilidadeChart";

const PERIOD_OPTIONS = [
  { value: "1d", label: "Por Dia" },
  { value: "1mo", label: "Por Mês" },
  { value: "1y", label: "Por Ano" },
] as const;

export default function RentabilidadeGeral() {
  // Buscar dados para os 3 períodos simultaneamente
  const { indices: indices1d, loading: loading1d, error: error1d } = useIndices("1d");
  const { indices: indices1mo, loading: loading1mo, error: error1mo } = useIndices("1mo");
  const { indices: indices1y, loading: loading1y, error: error1y } = useIndices("1y");
  
  const { resumo, loading: carteiraLoading } = useCarteira();

  // Calcular dados da carteira baseado no histórico de patrimônio
  const carteiraData = useMemo(() => {
    if (!resumo?.historicoPatrimonio || resumo.historicoPatrimonio.length === 0) {
      return [];
    }

    const historico = resumo.historicoPatrimonio;
    const firstValue = historico[0]?.valor || 0;
    
    if (firstValue === 0) return [];

    return historico.map(item => ({
      date: item.data,
      value: ((item.valor - firstValue) / firstValue) * 100,
    }));
  }, [resumo?.historicoPatrimonio]);

  const loading = loading1d || loading1mo || loading1y || carteiraLoading;
  const error = error1d || error1mo || error1y;

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
      {/* Gráfico Por Dia */}
      <ComponentCard title="Rentabilidade Por Dia">
        <RentabilidadeChart
          carteiraData={carteiraData}
          indicesData={indices1d}
          period="1d"
        />
      </ComponentCard>

      {/* Gráfico Por Mês */}
      <ComponentCard title="Rentabilidade Por Mês">
        <RentabilidadeChart
          carteiraData={carteiraData}
          indicesData={indices1mo}
          period="1mo"
        />
      </ComponentCard>

      {/* Gráfico Por Ano */}
      <ComponentCard title="Rentabilidade Por Ano">
        <RentabilidadeChart
          carteiraData={carteiraData}
          indicesData={indices1y}
          period="1y"
        />
      </ComponentCard>
    </div>
  );
}

