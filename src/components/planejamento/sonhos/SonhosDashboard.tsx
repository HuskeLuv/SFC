'use client';

import { useMemo, useState } from 'react';
import MetricCard from '@/components/carteira/shared/MetricCard';
import EmptyState from '@/components/carteira/shared/EmptyState';
import Button from '@/components/ui/button/Button';
import { progress, pmt } from '@/services/planejamento/planejamentoSonhos';
import type { PlanejamentoCategory, PlanejamentoObjetivoDTO } from '@/hooks/usePlanejamentoSonhos';
import SonhosObjetivoCard from './SonhosObjetivoCard';
import { formatBRLCompact, CATEGORY_LONG_LABELS } from './utils';

interface SonhosDashboardProps {
  objetivos: PlanejamentoObjetivoDTO[];
  onSelectObjetivo: (id: string) => void;
  onNew: () => void;
}

type TabValue = 'all' | PlanejamentoCategory;

const TABS: { value: TabValue; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'c', label: 'Curto Prazo' },
  { value: 'm', label: 'Médio Prazo' },
  { value: 'l', label: 'Longo Prazo' },
];

/**
 * Dashboard: 4 stat cards + filtro de categoria via tabs + grid de cards.
 * Stats são calculados em useMemo pra evitar recálculo a cada render do filtro.
 */
export default function SonhosDashboard({
  objetivos,
  onSelectObjetivo,
  onNew,
}: SonhosDashboardProps) {
  const [tab, setTab] = useState<TabValue>('all');

  const stats = useMemo(() => {
    const total = objetivos.length;
    const totalAlocado = objetivos.reduce((s, g) => s + progress(g).balance, 0);
    const aporteAtivo = objetivos
      .filter((g) => g.status === 'Iniciado')
      .reduce((s, g) => s + pmt(g), 0);
    const ativos = objetivos.filter((g) => g.status === 'Iniciado').length;
    const concluidos = objetivos.filter((g) => g.status === 'Concluído').length;
    const totalMeta = objetivos.reduce((s, g) => s + g.target, 0);

    // Progresso médio: média ponderada pelo target (objetivos maiores pesam mais).
    let weightedSum = 0;
    let weightTotal = 0;
    for (const g of objetivos) {
      weightedSum += progress(g).pct * g.target;
      weightTotal += g.target;
    }
    const progressoMedio = weightTotal > 0 ? weightedSum / weightTotal : 0;

    return { total, totalAlocado, totalMeta, aporteAtivo, ativos, concluidos, progressoMedio };
  }, [objetivos]);

  const filtered = useMemo(() => {
    if (tab === 'all') return objetivos;
    return objetivos.filter((g) => g.category === tab);
  }, [objetivos, tab]);

  const isEmpty = objetivos.length === 0;

  return (
    <div className="space-y-6">
      {/* Header com botão novo */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90">
            Planejamento de Sonhos
          </h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Acompanhe e organize seus objetivos financeiros.
          </p>
        </div>
        <Button onClick={onNew} size="sm">
          + Novo Objetivo
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total em Objetivos"
          value={String(stats.total)}
          color="primary"
          change={
            stats.concluidos > 0
              ? `${stats.concluidos} concluído${stats.concluidos !== 1 ? 's' : ''}`
              : undefined
          }
        />
        <MetricCard
          title="Patrimônio Alocado"
          value={formatBRLCompact(stats.totalAlocado)}
          color="success"
          change={`de ${formatBRLCompact(stats.totalMeta)} total`}
        />
        <MetricCard
          title="Aporte Mensal Ativo"
          value={formatBRLCompact(stats.aporteAtivo)}
          color="primary"
          change={`${stats.ativos} em andamento`}
        />
        <MetricCard
          title="Progresso Médio"
          value={`${stats.progressoMedio.toFixed(1)}%`}
          color="warning"
          change="ponderado por meta"
        />
      </div>

      {/* Tabs categoria */}
      <div className="border-b border-gray-200 dark:border-gray-800">
        <nav className="-mb-px flex flex-wrap gap-1">
          {TABS.map((t) => {
            const isActive = t.value === tab;
            const count =
              t.value === 'all'
                ? objetivos.length
                : objetivos.filter((g) => g.category === t.value).length;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
                aria-pressed={isActive}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </nav>
      </div>

      {/* Lista */}
      {isEmpty ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <EmptyState
            title="Nenhum objetivo cadastrado"
            description="Crie seu primeiro objetivo financeiro para começar a planejar."
          />
          <div className="flex justify-center">
            <Button onClick={onNew} size="sm">
              + Criar primeiro objetivo
            </Button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nenhum objetivo em <strong>{CATEGORY_LONG_LABELS[tab as PlanejamentoCategory]}</strong>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((g) => (
            <SonhosObjetivoCard key={g.id} objetivo={g} onClick={() => onSelectObjetivo(g.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
