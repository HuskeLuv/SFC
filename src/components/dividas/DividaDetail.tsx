'use client';

import { useState } from 'react';
import Button from '@/components/ui/button/Button';
import MetricCard from '@/components/carteira/shared/MetricCard';
import { logger } from '@/lib/logger';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useResponsiveConfirm } from '@/components/ui/sheet/useResponsiveConfirm';
import { MobileActionSheet, MobileMoreButton } from '@/components/ui/sheet/MobileActionSheet';
import { MobileMetricGrid } from '@/components/ui/mobile/MobileMetricGrid';
import { MobileStatusPill } from '@/components/ui/mobile/MobileStatusPill';
import {
  useDivida,
  useDividaCronograma,
  useDeleteDivida,
  useDeletePagamento,
  useUpdateDivida,
  type DividaDTO,
  type DividaStatus,
} from '@/hooks/useDividas';
import DividaForm from './DividaForm';
import CronogramaTable from './CronogramaTable';
import CronogramaChart from './CronogramaChart';
import SituacaoSheet from './mobile/SituacaoSheet';
import { dividaSituacao } from './mobile/dividaSituacao';
import {
  CATEGORIA_LABELS,
  INDEXADOR_LABELS,
  STATUS_LABELS,
  TIPO_LABELS,
  formatBRL,
  formatBRLCompact,
  formatYearMonth,
} from './utils';

interface DividaDetailProps {
  divida: DividaDTO;
  onBack: () => void;
  onDeleted: () => void;
  onRegistrarPagamento: () => void;
}

/**
 * Detalhe de uma dívida: saldo (corrigido pelo índice realizado quando
 * indexada), cronograma SAC/Price com gráfico e lista de pagamentos.
 *
 * PWA fase 3 (abaixo de lg, ramo `useIsBelowLg`): Situação em sheet, "Registrar pagamento" ao
 * lado, Editar/Excluir no ⋯ (excluir confirma em sheet), edição em sheet alto, números em 2×2 e
 * confirmação ao remover um pagamento. Mesmas mutations; o desktop fica igual.
 */
export default function DividaDetail({
  divida,
  onBack,
  onDeleted,
  onRegistrarPagamento,
}: DividaDetailProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [situacaoOpen, setSituacaoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isBelowLg = useIsBelowLg();
  const { confirmAndRun, confirmSheet } = useResponsiveConfirm();

  const isFinanciamento = divida.modalidade === 'financiamento';
  // Detalhe (com pagamentos) + cronograma vêm de queries próprias — a lista
  // não embute pagamentos.
  const { divida: detalhe } = useDivida(divida.id);
  const { data: cronogramaData } = useDividaCronograma(divida.id, isFinanciamento);

  const deleteDivida = useDeleteDivida();
  const deletePagamento = useDeletePagamento(divida.id);
  const updateDivida = useUpdateDivida();

  // Status como nos sonhos (pedido ago/2026): pausar/pôr em espera tira as
  // parcelas da projeção do fluxo, mas a dívida continua no passivo.
  const handleStatusChange = async (status: DividaStatus) => {
    if (status === divida.status) return;
    try {
      await updateDivida.mutateAsync({ id: divida.id, payload: { status } });
    } catch (err) {
      logger.error('Erro ao mudar status da dívida:', err);
      setError(err instanceof Error ? err.message : 'Erro ao mudar status.');
    }
  };

  const resumo = divida.resumo;
  const pagamentos = detalhe?.pagamentos ?? [];
  const indexada = divida.indexador !== 'PREFIXADO';
  const saldoExibido = indexada
    ? (cronogramaData?.saldoCorrigido ?? resumo?.saldoCorrigido ?? resumo?.saldoDevedor)
    : resumo?.saldoDevedor;
  const situacao = dividaSituacao(divida.status);

  const handleDelete = async () => {
    setError(null);
    try {
      await deleteDivida.mutateAsync(divida.id);
      onDeleted();
    } catch (err) {
      logger.error('Erro ao excluir dívida:', err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir dívida.');
    }
  };

  // Celular: confirma em sheet; o erro aparece dentro do sheet (confirmAndRun) com "Tentar de novo".
  const confirmDeleteMobile = () =>
    confirmAndRun(
      {
        title: `Excluir ${divida.nome}?`,
        message:
          'O cronograma, os pagamentos registrados e a linha dela no Fluxo de Caixa são apagados; as parcelas somem da Agenda.',
        confirmLabel: 'Excluir',
        danger: true,
        busyLabel: 'Excluindo…',
      },
      async () => {
        await deleteDivida.mutateAsync(divida.id);
        onDeleted();
      },
    );

  const confirmDeletePagamentoMobile = (p: { id: string; valor: number; month: string }) =>
    confirmAndRun(
      {
        title: 'Remover este pagamento?',
        message: `${formatBRL(p.valor)} · ${formatYearMonth(p.month)}. O saldo e o cronograma são recalculados sem ele.`,
        confirmLabel: 'Remover',
        danger: true,
        busyLabel: 'Removendo…',
      },
      async () => {
        await deletePagamento.mutateAsync(p.id);
      },
    );

  const handleDeletePagamento = async (pagamentoId: string) => {
    setError(null);
    try {
      await deletePagamento.mutateAsync(pagamentoId);
    } catch (err) {
      logger.error('Erro ao remover pagamento:', err);
      setError(err instanceof Error ? err.message : 'Erro ao remover pagamento.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 max-lg:w-full max-lg:items-start">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50 max-lg:inline-flex max-lg:min-h-11 max-lg:shrink-0 max-lg:items-center max-lg:rounded-xl max-lg:px-3 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            ← Voltar
          </button>
          <div className="max-lg:min-w-0 max-lg:flex-1">
            <h2 className="text-lg font-semibold text-gray-900 max-lg:break-words dark:text-white/90">
              {divida.nome}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {TIPO_LABELS[divida.tipo]}
              {divida.instituicao ? ` · ${divida.instituicao}` : ''}
              {isFinanciamento && divida.sistema
                ? ` · ${divida.sistema} · ${INDEXADOR_LABELS[divida.indexador]}`
                : ' · Rotativa'}
            </p>
          </div>
          {isBelowLg ? (
            <MobileMoreButton onClick={() => setMenuOpen(true)} label="Mais ações da dívida" />
          ) : null}
        </div>
        {isBelowLg ? (
          <div data-mf-mobile="" className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => setSituacaoOpen(true)}
              disabled={updateDivida.isPending}
              aria-haspopup="dialog"
              aria-label={`Situação: ${situacao.label}. Alterar`}
              className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 disabled:opacity-60 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <MobileStatusPill tone={situacao.tone} className="text-sm">
                {situacao.label}
              </MobileStatusPill>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="shrink-0 text-gray-500 dark:text-gray-400"
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={onRegistrarPagamento}
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-mf-seguranca px-4 text-sm font-semibold text-white dark:bg-mf-patrimonio"
            >
              Registrar pagamento
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={divida.status}
              onChange={(e) => handleStatusChange(e.target.value as DividaStatus)}
              disabled={updateDivida.isPending}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
              aria-label="Status da dívida"
            >
              {(Object.keys(STATUS_LABELS) as DividaStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <Button onClick={onRegistrarPagamento} size="sm">
              Registrar pagamento
            </Button>
            <Button onClick={() => setEditing((v) => !v)} size="sm" variant="outline">
              {editing ? 'Fechar edição' : 'Editar'}
            </Button>
            {confirmDelete ? (
              <>
                <Button
                  onClick={handleDelete}
                  size="sm"
                  variant="outline"
                  disabled={deleteDivida.isPending}
                  className="!border-red-300 !text-red-600 dark:!border-red-800 dark:!text-red-400"
                >
                  {deleteDivida.isPending ? 'Excluindo…' : 'Confirmar exclusão'}
                </Button>
                <Button onClick={() => setConfirmDelete(false)} size="sm" variant="outline">
                  Cancelar
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setConfirmDelete(true)}
                size="sm"
                variant="outline"
                className="!border-red-300 !text-red-600 dark:!border-red-800 dark:!text-red-400"
              >
                Excluir
              </Button>
            )}
          </div>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {editing ? (
        <DividaForm
          divida={divida}
          presentation={isBelowLg ? 'sheet' : 'inline'}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : null}

      {/* Cards de resumo (celular: os mesmos 4 números em 2×2) */}
      {isBelowLg ? (
        <MobileMetricGrid
          items={[
            {
              label: indexada ? 'Saldo (corrigido)' : 'Saldo Devedor',
              value: formatBRLCompact(saldoExibido),
              hint:
                indexada && cronogramaData
                  ? `${INDEXADOR_LABELS[divida.indexador]} ×${cronogramaData.fatorIndexacao.toFixed(4)}`
                  : undefined,
            },
            ...(isFinanciamento
              ? [
                  {
                    label: 'Próxima Parcela',
                    value: resumo?.proximaParcela
                      ? formatBRLCompact(
                          resumo.proximaParcelaCorrigida ?? resumo.proximaParcela.parcela,
                        )
                      : '—',
                    hint: resumo?.proximaParcela
                      ? `nº ${resumo.proximaParcela.numero} · ${formatYearMonth(resumo.proximaParcela.mes)}`
                      : 'todas pagas',
                  },
                  {
                    label: 'Progresso',
                    value:
                      resumo?.parcelasPagas != null && resumo.totalParcelas
                        ? `${resumo.parcelasPagas}/${resumo.totalParcelas}`
                        : '—',
                    hint:
                      resumo?.prazoRestanteMeses != null
                        ? `${resumo.prazoRestanteMeses} meses restantes`
                        : undefined,
                  },
                ]
              : [
                  {
                    label: 'Lançamentos',
                    value: String(pagamentos.length),
                    hint: `desde ${formatYearMonth(divida.dataSaldoInicial)}`,
                  },
                ]),
            { label: 'Prazo', value: resumo ? CATEGORIA_LABELS[resumo.categoria] : '—' },
          ]}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title={indexada ? 'Saldo Devedor (corrigido)' : 'Saldo Devedor'}
            value={formatBRLCompact(saldoExibido)}
            color="error"
            change={
              indexada && cronogramaData
                ? `${INDEXADOR_LABELS[divida.indexador]} realizado ×${cronogramaData.fatorIndexacao.toFixed(4)}`
                : undefined
            }
            changeDirection="neutral"
          />
          {isFinanciamento ? (
            <>
              <MetricCard
                title="Próxima Parcela"
                value={
                  resumo?.proximaParcela
                    ? formatBRLCompact(
                        resumo.proximaParcelaCorrigida ?? resumo.proximaParcela.parcela,
                      )
                    : '—'
                }
                color="primary"
                change={
                  resumo?.proximaParcela
                    ? `nº ${resumo.proximaParcela.numero} · ${formatYearMonth(resumo.proximaParcela.mes)}`
                    : 'todas pagas'
                }
                changeDirection="neutral"
              />
              <MetricCard
                title="Progresso"
                value={
                  resumo?.parcelasPagas != null && resumo.totalParcelas
                    ? `${resumo.parcelasPagas}/${resumo.totalParcelas}`
                    : '—'
                }
                color="success"
                change={
                  resumo?.prazoRestanteMeses != null
                    ? `${resumo.prazoRestanteMeses} meses restantes`
                    : undefined
                }
                changeDirection="neutral"
              />
            </>
          ) : (
            <MetricCard
              title="Lançamentos"
              value={String(pagamentos.length)}
              color="primary"
              change={`desde ${formatYearMonth(divida.dataSaldoInicial)}`}
              changeDirection="neutral"
            />
          )}
          <MetricCard
            title="Prazo"
            value={resumo ? CATEGORIA_LABELS[resumo.categoria] : '—'}
            color="warning"
            changeDirection="neutral"
          />
        </div>
      )}

      {/* Disclaimer de indexação */}
      {isFinanciamento && indexada ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
          Contrato indexado a {INDEXADOR_LABELS[divida.indexador]}: cada parcela é corrigida
          automaticamente pelo índice já realizado até o aniversário do mês dela; parcelas futuras
          aparecem com a correção realizada até hoje (sem projeção do índice) e avançam a cada
          divulgação. O saldo devedor é corrigido pelo índice realizado desde o primeiro vencimento
          — aproximação de exibição, não recálculo contratual.
        </div>
      ) : null}

      {/* Cronograma (só financiamento) */}
      {isFinanciamento && cronogramaData ? (
        <>
          <CronogramaChart
            cronograma={cronogramaData.cronograma}
            parcelasPagas={cronogramaData.saldo.parcelasPagas}
          />
          <CronogramaTable
            cronograma={cronogramaData.cronograma}
            parcelasPagas={cronogramaData.saldo.parcelasPagas}
            proximaParcela={cronogramaData.saldo.proximaParcela?.numero ?? null}
          />
        </>
      ) : null}

      {/* Pagamentos */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white/90">
          Pagamentos registrados
        </h3>
        {pagamentos.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nenhum pagamento registrado ainda.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {pagamentos.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 py-2 text-sm max-lg:min-h-11"
              >
                <div>
                  <span className="font-medium text-gray-900 dark:text-white/90">
                    {formatBRL(p.valor)}
                  </span>
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                    {formatYearMonth(p.month)}
                    {p.tipo === 'pagamento' && p.parcelaNumero != null
                      ? ` · parcela ${p.parcelaNumero}`
                      : ''}
                    {p.tipo === 'ajuste' ? ' · ajuste (soma ao saldo)' : ''}
                    {p.tipo === 'amortizacao_prazo'
                      ? ` · amortização (quitou ${p.parcelaNumero ?? '?'} parcela${(p.parcelaNumero ?? 0) !== 1 ? 's' : ''} do fim)`
                      : ''}
                    {p.notes ? ` · ${p.notes}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    isBelowLg ? confirmDeletePagamentoMobile(p) : handleDeletePagamento(p.id)
                  }
                  disabled={deletePagamento.isPending}
                  className="text-xs text-red-500 transition hover:text-red-700 disabled:opacity-50 max-lg:-mr-2 max-lg:inline-flex max-lg:min-h-11 max-lg:min-w-11 max-lg:shrink-0 max-lg:items-center max-lg:justify-center max-lg:px-2 max-lg:text-sm max-lg:font-medium max-lg:text-[#D92D20] dark:text-red-400 dark:max-lg:text-[#F97066]"
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isBelowLg ? (
        <>
          <SituacaoSheet
            isOpen={situacaoOpen}
            onClose={() => setSituacaoOpen(false)}
            status={divida.status}
            onSelect={handleStatusChange}
            disabled={updateDivida.isPending}
          />
          <MobileActionSheet
            isOpen={menuOpen}
            onClose={() => setMenuOpen(false)}
            title="Ações da dívida"
            subject={divida.nome}
            actions={[
              {
                id: 'editar',
                label: 'Editar',
                hint: 'Taxa, prazo, indexador e observações',
                onSelect: () => setEditing(true),
              },
              {
                id: 'excluir',
                label: 'Excluir dívida',
                hint: 'Some das Dívidas, do Fluxo de Caixa e da Agenda',
                danger: true,
                onSelect: () => {
                  void confirmDeleteMobile();
                },
              },
            ]}
          />
          {confirmSheet}
        </>
      ) : null}
    </div>
  );
}
