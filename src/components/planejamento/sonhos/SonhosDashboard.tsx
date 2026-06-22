'use client';

import { useMemo, useState } from 'react';
import MetricCard from '@/components/carteira/shared/MetricCard';
import EmptyState from '@/components/carteira/shared/EmptyState';
import Button from '@/components/ui/button/Button';
import { progress, pmt } from '@/services/planejamento/planejamentoSonhos';
import type { PlanejamentoCategory, PlanejamentoObjetivoDTO } from '@/hooks/usePlanejamentoSonhos';
import { usePlanejamentoContexto } from '@/hooks/usePlanejamentoContexto';
import SonhosObjetivoCard from './SonhosObjetivoCard';
import SonhosObjetivoInlineForm from './SonhosObjetivoInlineForm';
import ReservaEmergenciaWidget from './ReservaEmergenciaWidget';
import { formatBRLCompact, CATEGORY_LONG_LABELS } from './utils';

interface SonhosDashboardProps {
  objetivos: PlanejamentoObjetivoDTO[];
  onSelectObjetivo: (id: string) => void;
}

type TabValue = 'all' | PlanejamentoCategory;

const TABS: { value: TabValue; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'c', label: 'Curto Prazo' },
  { value: 'm', label: 'Médio Prazo' },
  { value: 'l', label: 'Longo Prazo' },
];

/**
 * Dashboard: stats + tabs + grid de cards. Cria objetivo inline (sem view
 * dedicada) — o card de criação aparece no topo da grid ao clicar "+
 * Adicionar".
 */
export default function SonhosDashboard({ objetivos, onSelectObjetivo }: SonhosDashboardProps) {
  const [tab, setTab] = useState<TabValue>('all');
  const [creating, setCreating] = useState(false);
  const { contexto } = usePlanejamentoContexto();

  const stats = useMemo(() => {
    const total = objetivos.length;
    const totalAlocado = objetivos.reduce((s, g) => s + progress(g).balance, 0);
    const aporteAtivo = objetivos
      .filter((g) => g.status === 'Iniciado')
      .reduce((s, g) => s + pmt(g), 0);
    const ativos = objetivos.filter((g) => g.status === 'Iniciado').length;
    const concluidos = objetivos.filter((g) => g.status === 'Concluído').length;
    const totalMeta = objetivos.reduce((s, g) => s + g.target, 0);

    let weightedSum = 0;
    let weightTotal = 0;
    for (const g of objetivos) {
      weightedSum += progress(g).pct * g.target;
      weightTotal += g.target;
    }
    const progressoMedio = weightTotal > 0 ? weightedSum / weightTotal : 0;

    return { total, totalAlocado, totalMeta, aporteAtivo, ativos, concluidos, progressoMedio };
  }, [objetivos]);

  // Capacidade de poupança: aportes planejados (ativos) vs. sobra média do
  // fluxo de caixa. Integra Sonhos ↔ fluxo de caixa.
  const capacidade = useMemo(() => {
    const sobra = contexto?.cashflow.sobraMensalMedia ?? 0;
    if (!contexto || sobra <= 0) return null;
    const comprometido = stats.aporteAtivo;
    return { sobra, comprometido, folga: sobra - comprometido, excede: comprometido > sobra };
  }, [contexto, stats.aporteAtivo]);

  const filtered = useMemo(() => {
    if (tab === 'all') return objetivos;
    return objetivos.filter((g) => g.category === tab);
  }, [objetivos, tab]);

  const isEmpty = objetivos.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90">
            Planejamento de Sonhos
          </h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Acompanhe e organize seus objetivos financeiros.
          </p>
        </div>
        {!creating ? (
          <Button onClick={() => setCreating(true)} size="sm">
            + Adicionar objetivo
          </Button>
        ) : null}
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

      {/* Capacidade de poupança (Sonhos ↔ fluxo de caixa) */}
      {capacidade ? (
        <div
          className={`rounded-xl border p-3 text-sm ${
            capacidade.excede
              ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-200'
              : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300'
          }`}
        >
          {capacidade.excede ? (
            <>
              ⚠️ Seus aportes planejados (
              <strong>{formatBRLCompact(capacidade.comprometido)}/mês</strong>) superam sua sobra
              média de caixa (<strong>{formatBRLCompact(capacidade.sobra)}/mês</strong>). Revise os
              prazos ou as metas para o plano caber no seu orçamento.
            </>
          ) : (
            <>
              Seus aportes planejados (
              <strong>{formatBRLCompact(capacidade.comprometido)}/mês</strong>) cabem na sua sobra
              de caixa (<strong>{formatBRLCompact(capacidade.sobra)}/mês</strong>). Folga de{' '}
              <strong>{formatBRLCompact(capacidade.folga)}/mês</strong>.
            </>
          )}
        </div>
      ) : null}

      {/* Reserva de emergência: ideal vs. atual (carteira ↔ fluxo de caixa) */}
      <ReservaEmergenciaWidget contexto={contexto} />

      {/* Inline create */}
      {creating ? (
        <SonhosObjetivoInlineForm
          objetivo={null}
          onCancel={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            onSelectObjetivo(id);
          }}
        />
      ) : null}

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
      {isEmpty && !creating ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <EmptyState
            title="Nenhum objetivo cadastrado"
            description="Crie seu primeiro objetivo financeiro pra começar a planejar."
          />
          <div className="flex justify-center">
            <Button onClick={() => setCreating(true)} size="sm">
              + Adicionar objetivo
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
