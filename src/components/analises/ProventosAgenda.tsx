"use client";
import React, { useState, useMemo } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import Badge from "@/components/ui/badge/Badge";
import { useProventos } from "@/hooks/useProventos";
import DatePicker from "@/components/form/date-picker";

const FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "realizado", label: "Realizado" },
  { value: "a_receber", label: "A Receber" },
] as const;

type FilterType = typeof FILTER_OPTIONS[number]["value"];

export default function ProventosAgenda() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  
  const { proventos, loading, error } = useProventos(
    startDate || undefined,
    endDate || undefined
  );

  // Filtrar e agrupar proventos por mês
  const proventosAgrupados = useMemo(() => {
    const filtered = proventos.filter(p => {
      if (filter === "all") return true;
      return p.status === filter;
    });

    const grouped: Record<string, typeof filtered> = {};
    
    filtered.forEach(provento => {
      const date = new Date(provento.data);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      
      grouped[monthKey].push(provento);
    });

    // Ordenar por data (mais recente primeiro)
    return Object.entries(grouped)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, items]) => ({
        month,
        items: items.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()),
        total: items.reduce((sum, item) => sum + item.valor, 0),
      }));
  }, [proventos, filter]);

  if (loading) {
    return <LoadingSpinner text="Carregando agenda de proventos..." />;
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

  const formatMonth = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return `${months[Number(month) - 1]} ${year}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Filtro:
          </label>
          <div className="flex gap-2">
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === option.value
                    ? "bg-brand-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <DatePicker
            id="start-date-agenda"
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
            id="end-date-agenda"
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

      {/* Lista de Proventos */}
      <ComponentCard title="Agenda de Proventos">
        <div className="space-y-6">
          {proventosAgrupados.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Nenhum provento encontrado no período selecionado
            </div>
          ) : (
            proventosAgrupados.map(({ month, items, total }) => (
              <div key={month} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0 pb-6 last:pb-0">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {formatMonth(month)}
                  </h3>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Total: <span className="text-brand-500">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Data
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Ativo
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Tipo
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Valor
                        </th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((provento) => (
                        <tr key={provento.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                            {formatDate(provento.data)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                            {provento.ativo}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {provento.tipo}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white font-medium">
                            R$ {provento.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              variant="light"
                              color={provento.status === 'realizado' ? 'success' : 'warning'}
                              size="sm"
                            >
                              {provento.status === 'realizado' ? 'Realizado' : 'A Receber'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </ComponentCard>
    </div>
  );
}

