'use client';

import { useState } from 'react';
import ComponentCard from '@/components/common/ComponentCard';
import MetricCard from '@/components/carteira/shared/MetricCard';
import Button from '@/components/ui/button/Button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { addMonths, planned, pmt, progress } from '@/services/planejamento/planejamentoSonhos';
import { useDeleteEntry, type PlanejamentoObjetivoDTO } from '@/hooks/usePlanejamentoSonhos';
import { StatusBadge, PriorityBadge, CategoryBadge } from './SonhosBadges';
import SonhosObjetivoEvolutionChart from './SonhosObjetivoEvolutionChart';
import SonhosObjetivoInlineForm from './SonhosObjetivoInlineForm';
import { formatBRL, formatBRLCompact, formatYearMonth } from './utils';

interface SonhosObjetivoDetailProps {
  objetivo: PlanejamentoObjetivoDTO;
  onBack: () => void;
  onRegistrarMes: () => void;
  onDeleted: () => void;
}

/**
 * Vista detalhada de um objetivo: header com badges, KPI row,
 * gráfico planejado vs realizado e tabela de entries (mês a mês).
 */
export default function SonhosObjetivoDetail({
  objetivo,
  onBack,
  onRegistrarMes,
  onDeleted,
}: SonhosObjetivoDetailProps) {
  const { pct, balance, count } = progress(objetivo);
  const aporte = pmt(objetivo);
  const restante = Math.max(0, objetivo.target - balance);
  const mesesRestantes = Math.max(0, objetivo.months - count);
  const conclusaoPrevista = objetivo.startDate
    ? formatYearMonth(addMonths(objetivo.startDate, objetivo.months))
    : null;
  const deleteEntry = useDeleteEntry(objetivo.id);
  const [removingMonth, setRemovingMonth] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const handleRemoveEntry = async (month: string) => {
    if (!window.confirm('Remover este registro?')) return;
    setRemovingMonth(month);
    try {
      await deleteEntry.mutateAsync(month);
    } finally {
      setRemovingMonth(null);
    }
  };

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="text-xs text-gray-500 hover:text-brand-500 dark:text-gray-400"
      >
        ← Voltar
      </button>

      {/* Header — swap pra inline form quando editando */}
      {editing ? (
        <SonhosObjetivoInlineForm
          objetivo={objetivo}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
          onDeleted={onDeleted}
        />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white/90 break-words">
              {objetivo.name}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <CategoryBadge category={objetivo.category} />
              <PriorityBadge priority={objetivo.priority} />
              <StatusBadge status={objetivo.status} />
            </div>
            {objetivo.notes ? (
              <p className="mt-2 max-w-2xl text-sm italic text-gray-500 dark:text-gray-400">
                “{objetivo.notes}”
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setEditing(true)} size="sm" variant="outline">
              Editar
            </Button>
            <Button onClick={onRegistrarMes} size="sm">
              + Registrar Mês
            </Button>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard title="Meta Total" value={formatBRLCompact(objetivo.target)} color="primary" />
        <MetricCard
          title="Patrimônio Atual"
          value={formatBRLCompact(balance)}
          color="success"
          change={`${pct.toFixed(1)}% concluído`}
        />
        <MetricCard
          title="Aporte Necessário"
          value={formatBRLCompact(aporte)}
          color="primary"
          change="por mês"
        />
        <MetricCard
          title="Faltam"
          value={restante <= 0 ? '— Meta!' : formatBRLCompact(restante)}
          color={restante <= 0 ? 'success' : 'error'}
        />
        <MetricCard
          title="Meses Restantes"
          value={String(mesesRestantes)}
          color="warning"
          change={`de ${objetivo.months} no plano`}
        />
      </div>

      {/* Resumo + conclusão prevista */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3">
            <div className="text-3xl font-semibold text-brand-500">{pct.toFixed(0)}%</div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white/90">
                {pct >= 100
                  ? 'Meta atingida!'
                  : pct >= 75
                    ? 'Quase lá!'
                    : pct >= 50
                      ? 'Meio caminho!'
                      : 'Em progresso'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatBRL(balance)} de {formatBRL(objetivo.target)} · Taxa:{' '}
                {(objetivo.rate * 100).toFixed(2)}%/mês
                {conclusaoPrevista ? ` · Conclusão: ${conclusaoPrevista}` : ''}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>

      {/* Gráfico */}
      <ComponentCard title="Evolução · Planejado vs Realizado">
        <SonhosObjetivoEvolutionChart objetivo={objetivo} />
      </ComponentCard>

      {/* Tabela de entries */}
      <ComponentCard title={`Histórico Mensal · ${count} registro${count !== 1 ? 's' : ''}`}>
        {objetivo.entries.length === 0 ? (
          <p className="py-8 text-center text-sm italic text-gray-500 dark:text-gray-400">
            Nenhum registro ainda — clique em &quot;+ Registrar Mês&quot; acima.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="border-b border-gray-200 dark:border-gray-800">
                  <TableCell
                    isHeader
                    className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase"
                  >
                    Mês
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase"
                  >
                    Aporte Real
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase"
                  >
                    Aporte Planejado
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase"
                  >
                    Δ Aporte
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase"
                  >
                    Saldo Real
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase"
                  >
                    Saldo Planejado
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase"
                  >
                    Δ Saldo
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase"
                  >
                    Progresso
                  </TableCell>
                  <TableCell isHeader className="px-3 py-2" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {objetivo.entries.map((entry, idx) => {
                  // Saldo planejado para o índice da entry (1-based).
                  const planejado = planned(objetivo, idx + 1);
                  const deltaAporte = entry.aporte - aporte;
                  const deltaSaldo = entry.balance - planejado;
                  const entryPct =
                    objetivo.target > 0
                      ? Math.min(100, (entry.balance / objetivo.target) * 100)
                      : 0;
                  const isLast = idx === objetivo.entries.length - 1;
                  const isRemoving = removingMonth === entry.month;
                  return (
                    <TableRow
                      key={entry.month}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
                      <TableCell className="px-3 py-2 font-medium text-gray-900 dark:text-white/90">
                        {formatYearMonth(entry.month)}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                        {formatBRL(entry.aporte)}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">
                        {formatBRL(aporte)}
                      </TableCell>
                      <TableCell
                        className={`px-3 py-2 text-right font-medium ${
                          deltaAporte >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {deltaAporte >= 0 ? '+' : ''}
                        {formatBRL(deltaAporte)}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white/90">
                        {formatBRL(entry.balance)}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">
                        {formatBRL(planejado)}
                      </TableCell>
                      <TableCell
                        className={`px-3 py-2 text-right font-medium ${
                          deltaSaldo >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {deltaSaldo >= 0 ? '+' : ''}
                        {formatBRL(deltaSaldo)}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-400">
                        {entryPct.toFixed(0)}%
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right">
                        {isLast ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveEntry(entry.month)}
                            disabled={isRemoving}
                            className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-300"
                            aria-label={`Remover registro de ${entry.month}`}
                          >
                            {isRemoving ? '...' : '✕'}
                          </button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </ComponentCard>
    </div>
  );
}
