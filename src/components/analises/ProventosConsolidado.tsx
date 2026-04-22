'use client';
import React, { useMemo, useState } from 'react';
import ComponentCard from '@/components/common/ComponentCard';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useProventos } from '@/hooks/useProventos';
import ProventosHistoricoChart from './ProventosHistoricoChart';
import ProventosDistribuicao from './ProventosDistribuicao';
import ProventosKpiCard from './ProventosKpiCard';

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

/** Resolve a date range (ISO strings) for each period pill. */
const resolvePeriodRange = (pill: PeriodPill): { startDate?: string; endDate?: string } => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const endDate = today.toISOString().split('T')[0];

  if (pill === 'inicio') return {};

  const start = new Date(today);
  if (pill === 'ano') {
    start.setMonth(0);
    start.setDate(1);
  } else if (pill === '12m') {
    start.setFullYear(start.getFullYear() - 1);
  } else if (pill === '24m') {
    start.setFullYear(start.getFullYear() - 2);
  } else if (pill === '36m') {
    start.setFullYear(start.getFullYear() - 3);
  }
  start.setHours(0, 0, 0, 0);
  return { startDate: start.toISOString().split('T')[0], endDate };
};

export default function ProventosConsolidado() {
  const [period, setPeriod] = useState<PeriodPill>('24m');
  const [groupBy, setGroupBy] = useState<GroupByType>('ativo');

  const { startDate, endDate } = useMemo(() => resolvePeriodRange(period), [period]);

  const { proventos, grouped, monthly, yearly, kpis, loading, error } = useProventos(
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
          tooltip="Capital total investido em ativos que pagam proventos"
        />
        <ProventosKpiCard
          title="Renda acumulada"
          bigValue={formatCurrency(kpis.rendaAcumulada.periodo)}
          subLabel="Últimos 12 meses"
          subValue={formatCurrency(kpis.rendaAcumulada.ult12m)}
          tooltip="Soma de todos os proventos recebidos no período selecionado"
        />
        <ProventosKpiCard
          title="Média mensal"
          bigValue={formatCurrency(kpis.mediaMensal.periodo)}
          subLabel="Últimos 12 meses"
          subValue={formatCurrency(kpis.mediaMensal.ult12m)}
          tooltip="Renda média por mês no período selecionado"
        />
        <ProventosKpiCard
          title="Resultado (YoC)"
          bigValue={formatPercent(kpis.yoc.periodo)}
          subLabel="Últimos 12 meses"
          subValue={formatPercent(kpis.yoc.ult12m)}
          tooltip="Yield on Cost: renda acumulada dividida pelo capital investido"
        />
        <ProventosKpiCard
          title="Proventos a receber"
          bigValue={formatCurrency(kpis.aReceber.futuro)}
          subLabel="Esse mês:"
          subValue={formatCurrency(kpis.aReceber.esseMes)}
          tooltip="Proventos já anunciados com pagamento previsto no futuro"
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
