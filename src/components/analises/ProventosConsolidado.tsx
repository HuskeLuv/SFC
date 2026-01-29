"use client";
import React, { useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useProventos } from "@/hooks/useProventos";
import ProventosHistoricoChart from "./ProventosHistoricoChart";
import ProventosDistribuicao from "./ProventosDistribuicao";
import DatePicker from "@/components/form/date-picker";

const GROUP_BY_OPTIONS = [
  { value: "ativo", label: "Por Ativo" },
  { value: "classe", label: "Por Classe de Ativo" },
  { value: "tipo", label: "Por Tipo de Provento" },
] as const;

type GroupByType = typeof GROUP_BY_OPTIONS[number]["value"];

export default function ProventosConsolidado() {
  const [groupBy, setGroupBy] = useState<GroupByType>("ativo");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [viewMode, setViewMode] = useState<"total" | "yield">("total");
  
  const { proventos, grouped, monthly, yearly, total, media, loading, error } = useProventos(
    startDate || undefined,
    endDate || undefined,
    groupBy
  );

  if (loading) {
    return <LoadingSpinner text="Carregando dados de proventos..." />;
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
      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Agrupar por:
          </label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupByType)}
            className="w-full h-11 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 bg-transparent text-gray-800 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700 dark:focus:border-brand-800"
          >
            {GROUP_BY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <DatePicker
            id="start-date"
            label="Data Inicial"
            mode="single"
            defaultDate={startDate ? new Date(startDate) : undefined}
            onChange={(selectedDates) => {
              if (selectedDates && selectedDates.length > 0) {
                const date = selectedDates[0];
                if (date instanceof Date) {
                  setStartDate(date.toISOString().split('T')[0]);
                }
              }
            }}
          />
        </div>
        <div>
          <DatePicker
            id="end-date"
            label="Data Final"
            mode="single"
            defaultDate={endDate ? new Date(endDate) : undefined}
            onChange={(selectedDates) => {
              if (selectedDates && selectedDates.length > 0) {
                const date = selectedDates[0];
                if (date instanceof Date) {
                  setEndDate(date.toISOString().split('T')[0]);
                }
              }
            }}
          />
        </div>
      </div>

      {/* Gráfico de Histórico */}
      <ComponentCard title="Histórico de Proventos">
        <ProventosHistoricoChart proventos={proventos} />
      </ComponentCard>

      {/* Distribuição de Proventos */}
      <ComponentCard title="Distribuição de Proventos">
        <div className="space-y-4">
          {/* Toggle de modo de exibição */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Modo de exibição:
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode("total")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    viewMode === "total"
                      ? "bg-brand-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  Total e Média
                </button>
                <button
                  onClick={() => setViewMode("yield")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    viewMode === "yield"
                      ? "bg-brand-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  Yield on Cost
                </button>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Média mensal: <span className="font-semibold text-gray-900 dark:text-white">
                  R$ {media.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Total acumulado: <span className="font-semibold text-gray-900 dark:text-white">
                  R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </p>
            </div>
          </div>

          <ProventosDistribuicao
            grouped={grouped}
            viewMode={viewMode}
          />
        </div>
      </ComponentCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ComponentCard title="Proventos por Mês">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Mês
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(monthly)
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([month, data]) => (
                    <tr key={month} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {month}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                        R$ {data.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                {Object.keys(monthly).length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                      Nenhum provento encontrado no período selecionado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ComponentCard>

        <ComponentCard title="Consolidado Anual">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Ano
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(yearly)
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([year, data]) => (
                    <tr key={year} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {year}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                        R$ {data.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                {Object.keys(yearly).length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                      Nenhum provento encontrado no período selecionado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ComponentCard>
      </div>
    </div>
  );
}

