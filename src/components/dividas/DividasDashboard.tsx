'use client';

import { useMemo, useState } from 'react';
import MetricCard from '@/components/carteira/shared/MetricCard';
import EmptyState from '@/components/carteira/shared/EmptyState';
import Button from '@/components/ui/button/Button';
import { MobileTabRail } from '@/components/ui/tabs/MobileTabRail';
import { MobileMetricGrid } from '@/components/ui/mobile/MobileMetricGrid';
import { MobilePageState } from '@/components/ui/mobile/MobilePageState';
import type { DividaDTO } from '@/hooks/useDividas';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import DividasTable from './DividasTable';
import DividaForm from './DividaForm';
import { currentYearMonth, formatBRLCompact } from './utils';

interface DividasDashboardProps {
  dividas: DividaDTO[];
  onSelectDivida: (id: string) => void;
}

type TabValue = 'all' | 'c' | 'm' | 'l';

const TABS: { value: TabValue; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'c', label: 'Curto Prazo' },
  { value: 'm', label: 'Médio Prazo' },
  { value: 'l', label: 'Longo Prazo' },
];

/**
 * Dashboard de Dívidas: stat cards + tabs por prazo + tabela. Cadastro
 * inline (form aparece no topo ao clicar "+ Adicionar").
 *
 * PWA fase 3 (abaixo de lg, ramo `useIsBelowLg`): "+ Nova" ao lado do título, números em 2×2,
 * prazos em chips, cartões (DividasTable) e o cadastro em sheet alto. Desktop igual.
 */
export default function DividasDashboard({ dividas, onSelectDivida }: DividasDashboardProps) {
  const [tab, setTab] = useState<TabValue>('all');
  const [creating, setCreating] = useState(false);
  const isBelowLg = useIsBelowLg();

  // Em aberto = não concluída (pausada/em espera segue devendo); as parcelas
  // do mês só contam as INICIADAS — pausada não está pagando.
  const emAberto = useMemo(() => dividas.filter((d) => d.status !== 'quitada'), [dividas]);
  const iniciadas = useMemo(() => dividas.filter((d) => d.status === 'ativa'), [dividas]);

  const stats = useMemo(() => {
    const totalDevido = emAberto.reduce((s, d) => s + (d.resumo?.saldoDevedor ?? 0), 0);
    const curtoPrazo = emAberto
      .filter((d) => d.resumo?.categoria === 'c')
      .reduce((s, d) => s + (d.resumo?.saldoDevedor ?? 0), 0);
    // Comprometimento do mês: parcela da próxima parcela quando vence neste mês
    // (financiamentos iniciados).
    const mesAtual = currentYearMonth();
    const parcelasMes = iniciadas.reduce((s, d) => {
      const prox = d.resumo?.proximaParcela;
      return prox && prox.mes <= mesAtual ? s + prox.parcela : s;
    }, 0);
    const quitadas = dividas.length - emAberto.length;
    return { totalDevido, curtoPrazo, parcelasMes, quitadas };
  }, [dividas, emAberto, iniciadas]);

  const filtered = useMemo(() => {
    if (tab === 'all') return dividas;
    return dividas.filter((d) => d.resumo?.categoria === tab);
  }, [dividas, tab]);

  const isEmpty = dividas.length === 0;
  const countOf = (value: TabValue) =>
    value === 'all' ? dividas.length : dividas.filter((d) => d.resumo?.categoria === value).length;
  const onSaved = (id: string) => {
    setCreating(false);
    onSelectDivida(id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90">Dívidas</h2>
          <p className="mt-0.5 text-sm text-gray-500 max-lg:hidden dark:text-gray-400">
            Registre financiamentos e dívidas, acompanhe o saldo devedor e o cronograma SAC/Price.
          </p>
        </div>
        {!creating ? (
          <Button onClick={() => setCreating(true)} size="sm" className="max-lg:hidden">
            + Adicionar dívida
          </Button>
        ) : null}
        {isBelowLg ? (
          <button
            type="button"
            data-mf-mobile=""
            onClick={() => setCreating(true)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-mf-seguranca px-4 text-sm font-semibold text-white dark:bg-mf-patrimonio"
          >
            <span aria-hidden="true">+</span> Nova
          </button>
        ) : null}
      </div>

      {/* Celular: cadastro em sheet alto (o mesmo form, com números de vírgula). */}
      {isBelowLg && creating ? (
        <DividaForm
          divida={null}
          presentation="sheet"
          onCancel={() => setCreating(false)}
          onSaved={onSaved}
        />
      ) : null}

      {isBelowLg && isEmpty ? (
        <MobilePageState
          kind="empty"
          title="Nenhuma dívida cadastrada"
          text="Cadastre um financiamento ou uma dívida rotativa pra acompanhar o saldo devedor."
          action={{ label: 'Cadastrar dívida', onClick: () => setCreating(true) }}
        />
      ) : null}

      {isBelowLg && !isEmpty ? (
        <>
          <MobileMetricGrid
            items={[
              {
                label: 'Total Devido',
                value: formatBRLCompact(stats.totalDevido),
                hint: `${emAberto.length} em aberto`,
              },
              {
                label: 'Parcelas do Mês',
                value: formatBRLCompact(stats.parcelasMes),
                hint: 'financiamentos iniciados',
              },
              {
                label: 'Curto Prazo',
                value: formatBRLCompact(stats.curtoPrazo),
                hint: 'vence em até 12 meses',
              },
              { label: 'Concluídas', value: String(stats.quitadas), hint: `de ${dividas.length}` },
            ]}
          />
          <MobileTabRail
            tabs={TABS.map((t) => ({ id: t.value, label: t.label, count: countOf(t.value) }))}
            activeId={tab}
            onChange={(id) => setTab(id as TabValue)}
            ariaLabel="Filtrar por prazo"
            variant="chips"
            semantics="filter"
          />
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Nenhuma dívida nesse prazo.
            </p>
          ) : (
            <DividasTable dividas={filtered} onSelectDivida={onSelectDivida} />
          )}
        </>
      ) : null}

      {isBelowLg ? null : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total Devido"
              value={formatBRLCompact(stats.totalDevido)}
              color="error"
              change={`${emAberto.length} dívida${emAberto.length !== 1 ? 's' : ''} em aberto`}
              changeDirection="neutral"
            />
            <MetricCard
              title="Curto Prazo"
              value={formatBRLCompact(stats.curtoPrazo)}
              color="warning"
              change="vence em até 12 meses"
              changeDirection="neutral"
            />
            <MetricCard
              title="Parcelas do Mês"
              value={formatBRLCompact(stats.parcelasMes)}
              color="primary"
              change="financiamentos iniciados"
              changeDirection="neutral"
            />
            <MetricCard
              title="Concluídas"
              value={String(stats.quitadas)}
              color="success"
              changeDirection="neutral"
            />
          </div>

          {/* Inline create */}
          {creating ? (
            <DividaForm divida={null} onCancel={() => setCreating(false)} onSaved={onSaved} />
          ) : null}

          {/* Tabs por prazo */}
          <div className="border-b border-gray-200 dark:border-gray-800">
            <nav className="-mb-px flex flex-wrap gap-1">
              {TABS.map((t) => {
                const isActive = t.value === tab;
                const count = countOf(t.value);
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
                title="Nenhuma dívida cadastrada"
                description="Cadastre um financiamento ou uma dívida rotativa pra acompanhar o saldo devedor."
              />
              <div className="flex justify-center">
                <Button onClick={() => setCreating(true)} size="sm">
                  + Adicionar dívida
                </Button>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-gray-800 dark:bg-white/[0.03]">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Nenhuma dívida nesse prazo.
              </p>
            </div>
          ) : (
            <DividasTable dividas={filtered} onSelectDivida={onSelectDivida} />
          )}
        </>
      )}
    </div>
  );
}
