'use client';
import React, { useMemo, useState } from 'react';
import ComponentCard from '@/components/common/ComponentCard';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useProventos } from '@/hooks/useProventos';
import ProventosHistoricoChart from './ProventosHistoricoChart';
import ProventosDistribuicao from './ProventosDistribuicao';
import ProventosKpiCard from './ProventosKpiCard';
import { inicioUltimosNMeses, inicioDoAno, toISODate } from '@/utils/periodWindow';

type PeriodPill = 'ano' | '12m' | '24m' | '36m' | 'inicio';
type GroupByType = 'ativo' | 'classe' | 'tipo';

const PERIOD_OPTIONS: Array<{ value: PeriodPill; label: string }> = [
  { value: 'ano', label: 'No ano' },
  { value: '12m', label: '12 meses' },
  { value: '24m', label: '24 meses' },
  { value: '36m', label: '36 meses' },
  { value: 'inicio', label: 'Do início' },
];

const formatDateBR = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

const formatCurrency = (value: number) =>
  `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatPercent = (value: number) => `${value.toFixed(2)}%`;

/**
 * Resolve a date range (ISO strings) for each period pill.
 * Janelas ancoradas em mês-calendário (dia 1º), como o Kinvo: "24 meses" em
 * jun/2026 começa em 01/07/2024, não 06/06/2024 (janela rolante dia-a-dia).
 */
const resolvePeriodRange = (pill: PeriodPill): { startDate?: string; endDate?: string } => {
  const now = new Date();
  const endDate = toISODate(now);

  if (pill === 'inicio') return {};

  let start: Date;
  if (pill === 'ano') {
    start = inicioDoAno(now);
  } else if (pill === '12m') {
    start = inicioUltimosNMeses(12, now);
  } else if (pill === '24m') {
    start = inicioUltimosNMeses(24, now);
  } else {
    start = inicioUltimosNMeses(36, now);
  }
  return { startDate: toISODate(start), endDate };
};

export default function ProventosConsolidado() {
  const [period, setPeriod] = useState<PeriodPill>('24m');
  const [groupBy, setGroupBy] = useState<GroupByType>('ativo');

  const { startDate, endDate } = useMemo(() => resolvePeriodRange(period), [period]);

  const { proventos, grouped, monthly, yearly, kpis, loading, isFetching, error } = useProventos(
    startDate,
    endDate,
    groupBy,
  );

  const periodLabel = useMemo(() => {
    if (!startDate || !endDate) {
      // "Do início" — usa a data do primeiro provento, se houver
      if (proventos.length === 0) return '—';
      const datas = proventos
        .map((p) => new Date(p.data).getTime())
        .filter((t) => Number.isFinite(t));
      if (datas.length === 0) return '—';
      const start = new Date(Math.min(...datas));
      const end = new Date(Math.max(...datas));
      return `${formatDateBR(start)} - ${formatDateBR(end)}`;
    }
    return `${formatDateBR(new Date(startDate))} - ${formatDateBR(new Date(endDate))}`;
  }, [startDate, endDate, proventos]);

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
      {/* Period pills */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {isFetching && !loading && (
          <span
            className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
            role="status"
            aria-live="polite"
          >
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            Atualizando…
          </span>
        )}
        <span className="text-sm text-gray-500 dark:text-gray-400">Período:</span>
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setPeriod(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              period === opt.value
                ? 'bg-brand-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <ProventosKpiCard
          title="Total investido"
          bigValue={formatCurrency(kpis.totalInvestido)}
          subLabel="Aportes nos últ. 12 meses:"
          subValue={formatCurrency(kpis.aportesUlt12m)}
        />
        <ProventosKpiCard
          title="Renda acumulada"
          bigValue={formatCurrency(kpis.rendaAcumulada.periodo)}
          subLabel="Últimos 12 meses"
          subValue={formatCurrency(kpis.rendaAcumulada.ult12m)}
        />
        <ProventosKpiCard
          title="Média mensal"
          bigValue={formatCurrency(kpis.mediaMensal.periodo)}
          subLabel="Últimos 12 meses"
          subValue={formatCurrency(kpis.mediaMensal.ult12m)}
        />
        <ProventosKpiCard
          title="Resultado (YoC)"
          bigValue={formatPercent(kpis.yoc.periodo)}
          subLabel="Últimos 12 meses"
          subValue={formatPercent(kpis.yoc.ult12m)}
        />
        <ProventosKpiCard
          title="Proventos a receber"
          bigValue={formatCurrency(kpis.aReceber.futuro)}
          subLabel="Esse mês:"
          subValue={formatCurrency(kpis.aReceber.esseMes)}
        />
      </div>

      {/* Gráfico de Histórico */}
      <ComponentCard title="Histórico de Proventos">
        <ProventosHistoricoChart proventos={proventos} />
      </ComponentCard>

      {/* Distribuição */}
      <ProventosDistribuicao
        grouped={grouped}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        periodLabel={periodLabel}
      />

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
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{month}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                        {formatCurrency(data.total)}
                      </td>
                    </tr>
                  ))}
                {Object.keys(monthly).length === 0 && (
                  <tr>
                    <td
                      colSpan={2}
                      className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
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
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{year}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                        {formatCurrency(data.total)}
                      </td>
                    </tr>
                  ))}
                {Object.keys(yearly).length === 0 && (
                  <tr>
                    <td
                      colSpan={2}
                      className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
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
