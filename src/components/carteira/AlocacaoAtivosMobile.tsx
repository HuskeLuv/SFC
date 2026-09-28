'use client';

import React, { useState } from 'react';
import Alert from '../ui/alert/Alert';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import { quantoFaltaMobile } from '@/components/carteira/shared/quantoFaltaClass';
import { CATEGORIA_CORES } from '@/lib/carteiraCategoryColors';
import { formatDecimalInput, parseDecimalInput } from '@/lib/ui/numberInput';
import { CATEGORIA_TO_TAB } from './carteiraTabsConfig';
import AlocacaoMetaSheet, { type AlocacaoMetaField } from './AlocacaoMetaSheet';

/** Linha já calculada pela AlocacaoAtivosTable (mesmo cálculo do desktop; aqui só exibição). */
export interface AlocacaoLinha {
  categoria: string;
  classeAtivo: string;
  total: number;
  percentualAtual: number;
  alocacaoMinimo: number;
  alocacaoMaximo: number;
  percentualTarget: number;
  quantoFalta: number;
  necessidadeAporte: number;
  necessidadeSemCaixa: number;
  excessoAporte: number;
  descricao: string;
}

export interface AlocacaoAtivosMobileProps {
  dados: AlocacaoLinha[];
  totalDinheiro: number;
  totalDinheiroMaisBens: number;
  totalPercentualTarget: number;
  totalCarteira: number;
  formatarMoeda: (v: number) => string;
  formatarPercentual: (v: number) => string;
  formatarValorReserva: (percent: number) => string;
  parseValorReserva: (raw: string) => number;
  onNavigateToTab?: (tabId: string) => void;
  /** `handleConfigChange` da tabela: só estado local (updateConfiguracao). */
  onConfigChange: (categoria: string, field: AlocacaoMetaField, valor: number) => void;
  /** `handleSaveConfigurations` da tabela (o MESMO saveChanges do botão do desktop). */
  onSave: () => Promise<boolean>;
  /** Descarta o que foi aplicado e não salvo (volta ao que está gravado). */
  onDiscard: () => void;
  /** Classes com meta aplicada e não gravada (`changedCategorias` do useAlocacaoConfig). */
  changedCategorias: string[];
  successMessage: string | null;
  configError: string | null;
  distribuir: { label: string; onOpen: () => void } | null;
  /** O modal "Distribuir caixa livre" (vira sheet no celular). */
  children?: React.ReactNode;
}

const PencilIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4Zm9.5-13.5 4 4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="m9 6 6 6-6 6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CARD =
  'rounded-2xl border border-gray-200 bg-white px-4 py-3.5 dark:border-gray-800 dark:bg-white/[0.03]';

/** Ponto #0079F2 (não textual) no valor aplicado e ainda não salvo. */
const ChangedDot = () => (
  <span
    aria-hidden="true"
    className="ml-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#0079F2] align-middle"
  />
);

/**
 * "Alocação de ativos" no celular (PWA fase 1): a MESMA tabela do desktop em cartões — barra
 * empilhada da alocação atual, um cartão por classe (link para a aba, valor, % atual / mín·máx /
 * target, Quanto Falta, aporte e Editar), totais e Imóveis & Bens à parte. Editar abre o
 * AlocacaoMetaSheet ("Aplicar" = estado local); a barra fixa grava com o saveChanges de sempre.
 */
export default function AlocacaoAtivosMobile({
  dados,
  totalDinheiro,
  totalDinheiroMaisBens,
  totalPercentualTarget,
  totalCarteira,
  formatarMoeda,
  formatarPercentual,
  formatarValorReserva,
  parseValorReserva,
  onNavigateToTab,
  onConfigChange,
  onSave,
  onDiscard,
  changedCategorias,
  successMessage,
  configError,
  distribuir,
  children,
}: AlocacaoAtivosMobileProps) {
  const [editing, setEditing] = useState<string | null>(null);
  // Vem do hook (não é estado local): trocar de aba desmonta este componente, e as metas aplicadas
  // continuam no useAlocacaoConfig — a barra Salvar/Descartar precisa continuar aparecendo.
  const dirty = new Set(changedCategorias);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const classes = dados.filter((d) => d.categoria !== 'imoveisBens');
  const imoveis = dados.find((d) => d.categoria === 'imoveisBens');
  const editingRow = editing ? dados.find((d) => d.categoria === editing) : undefined;
  const isReserva = (categoria: string) => categoria === 'reservaEmergencia';

  const pct1 = (v: number) =>
    `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

  const comValor = classes.filter((d) => d.total > 0);
  const somaBarra = comValor.reduce((sum, d) => sum + d.total, 0);
  const resumoBarra = [...comValor]
    .sort((a, b) => b.percentualAtual - a.percentualAtual)
    .map((d) => `${d.classeAtivo} ${pct1(d.percentualAtual)}`)
    .join(', ');

  const handleSave = async () => {
    setSaving(true);
    setSaveError(false);
    const ok = await onSave();
    setSaving(false);
    if (!ok) setSaveError(true);
  };

  const handleDiscard = () => {
    onDiscard();
    setSaveError(false);
  };

  const quantoFaltaTexto = (linha: AlocacaoLinha): { label: string; tone: string; dot: string } => {
    const qf = quantoFaltaMobile(linha.quantoFalta);
    if (isReserva(linha.categoria)) {
      const texto =
        linha.necessidadeSemCaixa > 0
          ? `Falta ${formatarMoeda(linha.necessidadeSemCaixa)}`
          : linha.excessoAporte > 0
            ? `Acima ${formatarMoeda(linha.excessoAporte)}`
            : 'No objetivo';
      return { label: texto, tone: qf.textClass, dot: qf.dotClass };
    }
    const texto =
      qf.label === 'Falta' || qf.label === 'Acima'
        ? `${qf.label} ${formatarPercentual(Math.abs(linha.quantoFalta))}`
        : qf.label;
    return { label: texto, tone: qf.textClass, dot: qf.dotClass };
  };

  return (
    <section aria-labelledby="alocacao-mobile-titulo" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2
          id="alocacao-mobile-titulo"
          className="text-base font-semibold text-gray-800 dark:text-white/90"
        >
          Alocação de ativos
        </h2>
        <span className="text-[12.5px] text-gray-500 dark:text-gray-400">
          {classes.length} classes
        </span>
      </div>

      {successMessage && <Alert variant="success" title="Sucesso" message={successMessage} />}
      {configError && <Alert variant="error" title="Erro" message={configError} />}

      {somaBarra > 0 && (
        <div
          role="img"
          aria-label={`Alocação atual: ${resumoBarra}`}
          className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]"
        >
          {comValor.map((d) => (
            <span
              key={d.categoria}
              className="h-full"
              style={{
                width: `${(d.total / somaBarra) * 100}%`,
                backgroundColor: CATEGORIA_CORES[d.categoria],
              }}
            />
          ))}
        </div>
      )}

      <ul className="flex flex-col gap-2" aria-label="Classes de ativos">
        {classes.map((linha) => {
          const reserva = isReserva(linha.categoria);
          const tab = CATEGORIA_TO_TAB[linha.categoria];
          const changed = dirty.has(linha.categoria);
          const qf = quantoFaltaTexto(linha);
          const escala = Math.max(linha.percentualAtual, linha.percentualTarget, 1) * 1.15;
          const fmt = (v: number) => (reserva ? formatarValorReserva(v) : formatarPercentual(v));
          return (
            <li key={linha.categoria} data-mf-alocacao={linha.categoria} className={CARD}>
              <div className="flex items-start justify-between gap-3">
                {onNavigateToTab && tab ? (
                  <button
                    type="button"
                    onClick={() => onNavigateToTab(tab)}
                    className="-my-2 inline-flex min-h-11 min-w-0 items-center gap-0.5 text-left text-[15px] font-semibold text-mf-patrimonio dark:text-mf-tranquilidade"
                  >
                    <span className="min-w-0">{linha.classeAtivo}</span>
                    <ChevronIcon />
                  </button>
                ) : (
                  <span className="min-w-0 text-[15px] font-semibold text-gray-800 dark:text-white/90">
                    {linha.classeAtivo}
                  </span>
                )}
                <span className="shrink-0 text-[15px] font-semibold tabular-nums text-gray-800 dark:text-white/90">
                  {formatarMoeda(linha.total)}
                </span>
              </div>

              {/* Medidor: % atual com traço na meta (os números estão na grade abaixo). */}
              <div
                aria-hidden="true"
                className="relative mt-2 h-1.5 w-full rounded-full bg-gray-100 dark:bg-white/[0.06]"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.min(100, (linha.percentualAtual / escala) * 100)}%`,
                    backgroundColor: CATEGORIA_CORES[linha.categoria],
                  }}
                />
                {linha.percentualTarget > 0 && (
                  <span
                    className="absolute -top-1 h-3.5 w-0.5 rounded bg-mf-potencia dark:bg-mf-escolha"
                    style={{ left: `${Math.min(100, (linha.percentualTarget / escala) * 100)}%` }}
                  />
                )}
              </div>

              <dl className={`mt-3 ${TABLE_MOBILE_STYLES.cardDetailGrid}`}>
                <div className="min-w-0">
                  <dt className={TABLE_MOBILE_STYLES.cardDetailLabel}>% Atual</dt>
                  <dd className={TABLE_MOBILE_STYLES.cardDetailValue}>
                    {formatarPercentual(linha.percentualAtual)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className={TABLE_MOBILE_STYLES.cardDetailLabel}>Mín · Máx</dt>
                  <dd className={`${TABLE_MOBILE_STYLES.cardDetailValue} break-words`}>
                    {fmt(linha.alocacaoMinimo)} · {fmt(linha.alocacaoMaximo)}
                    {changed && <ChangedDot />}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className={TABLE_MOBILE_STYLES.cardDetailLabel}>
                    {reserva ? 'Alvo' : '% Target'}
                  </dt>
                  <dd
                    className={`${TABLE_MOBILE_STYLES.cardDetailValue} break-words font-semibold`}
                  >
                    {fmt(linha.percentualTarget)}
                    {changed && <ChangedDot />}
                  </dd>
                </div>
              </dl>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className={`inline-flex items-center gap-1.5 text-[13px] font-medium tabular-nums ${qf.tone}`}
                >
                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${qf.dot}`} />
                  {qf.label}
                </span>
                <span className="text-[13px] tabular-nums text-gray-600 dark:text-gray-400">
                  {linha.necessidadeAporte > 0
                    ? `Aporte ${formatarMoeda(linha.necessidadeAporte)}`
                    : linha.excessoAporte > 0
                      ? `Excesso ${formatarMoeda(linha.excessoAporte)}`
                      : 'Sem aporte'}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(linha.categoria)}
                  aria-label={`Editar meta de ${linha.classeAtivo}`}
                  className={`ml-auto ${TABLE_MOBILE_STYLES.editButton}`}
                >
                  <PencilIcon />
                  Editar
                </button>
              </div>

              {linha.descricao && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{linha.descricao}</p>
              )}
            </li>
          );
        })}
      </ul>

      <dl className={`${TABLE_MOBILE_STYLES.totalCard} flex flex-col gap-1.5 text-sm`}>
        <div className="flex justify-between gap-3">
          <dt>Total Dinheiro</dt>
          <dd className="font-semibold tabular-nums">{formatarMoeda(totalDinheiro)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Soma dos % Target</dt>
          <dd className="tabular-nums">{formatarPercentual(totalPercentualTarget)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Total Dinheiro + Bens</dt>
          <dd className="font-semibold tabular-nums">{formatarMoeda(totalDinheiroMaisBens)}</dd>
        </div>
      </dl>

      {imoveis && (
        <div className={CARD}>
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400">
            Fora da rentabilidade e das metas
          </p>
          <div className="mt-1 flex items-start justify-between gap-3">
            {onNavigateToTab ? (
              <button
                type="button"
                onClick={() => onNavigateToTab(CATEGORIA_TO_TAB.imoveisBens)}
                className="-my-2 inline-flex min-h-11 items-center gap-0.5 text-left text-[15px] font-semibold text-mf-patrimonio dark:text-mf-tranquilidade"
              >
                {imoveis.classeAtivo}
                <ChevronIcon />
              </button>
            ) : (
              <span className="text-[15px] font-semibold">{imoveis.classeAtivo}</span>
            )}
            <span className="text-right">
              <span className="block text-[15px] font-semibold tabular-nums text-gray-800 dark:text-white/90">
                {formatarMoeda(imoveis.total)}
              </span>
              <span className="block text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {formatarPercentual(imoveis.percentualAtual)} do dinheiro + bens
              </span>
            </span>
          </div>
        </div>
      )}

      {distribuir && (
        <button
          type="button"
          onClick={distribuir.onOpen}
          className="h-12 w-full rounded-xl border border-mf-patrimonio px-4 text-base font-semibold text-mf-patrimonio dark:border-mf-tranquilidade dark:text-mf-tranquilidade"
        >
          {distribuir.label}
        </button>
      )}

      {/* Espaço para a barra fixa não cobrir o fim da lista. */}
      {dirty.size > 0 && <div aria-hidden="true" className="h-24" />}

      {dirty.size > 0 && (
        <div
          role="region"
          aria-label="Alterações de alocação não salvas"
          data-mf-alocacao-pendente=""
          className="fixed inset-x-4 z-[9985] flex flex-col gap-2 rounded-2xl border border-mf-tranquilidade bg-white p-3 shadow-lg dark:bg-gray-900 lg:hidden"
          style={{ bottom: 'calc(var(--mf-bottom-nav-h, 0px) + 0.5rem)' }}
        >
          <p role="status" className="text-sm font-medium text-gray-800 dark:text-white/90">
            {dirty.size} {dirty.size > 1 ? 'alterações' : 'alteração'} de alocação ainda não{' '}
            {dirty.size > 1 ? 'salvas' : 'salva'}
          </p>
          {saveError && (
            <p role="alert" className="text-[12.5px] text-[#D92D20] dark:text-[#F97066]">
              Não foi possível salvar. Tente de novo.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={saving}
              className="h-11 flex-1 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              aria-busy={saving || undefined}
              className="h-11 flex-1 rounded-xl bg-mf-patrimonio text-sm font-semibold text-white disabled:opacity-80"
            >
              {saving ? 'Salvando…' : 'Salvar configurações'}
            </button>
          </div>
        </div>
      )}

      {editingRow && (
        <AlocacaoMetaSheet
          isOpen={!!editingRow}
          onClose={() => setEditing(null)}
          classe={editingRow.classeAtivo}
          emReais={isReserva(editingRow.categoria)}
          values={{
            minimo: editingRow.alocacaoMinimo,
            maximo: editingRow.alocacaoMaximo,
            target: editingRow.percentualTarget,
          }}
          toDisplay={(percent) =>
            isReserva(editingRow.categoria)
              ? formatDecimalInput(totalCarteira > 0 ? (percent / 100) * totalCarteira : 0)
              : percent.toLocaleString('pt-BR', {
                  maximumFractionDigits: 4,
                  useGrouping: false,
                })
          }
          parse={(raw) => {
            if (isReserva(editingRow.categoria)) {
              const v = parseValorReserva(raw);
              return Number.isFinite(v) ? v : null;
            }
            return parseDecimalInput(raw);
          }}
          describeLimit={(percent) =>
            isReserva(editingRow.categoria)
              ? formatarValorReserva(percent)
              : formatarPercentual(percent)
          }
          hint={
            isReserva(editingRow.categoria)
              ? `Hoje: ${formatarMoeda(editingRow.total)} na reserva.`
              : `Hoje: ${formatarPercentual(editingRow.percentualAtual)} da carteira.`
          }
          onApply={(changes) => {
            (Object.keys(changes) as AlocacaoMetaField[]).forEach((field) => {
              const valor = changes[field];
              if (valor !== undefined) onConfigChange(editingRow.categoria, field, valor);
            });
          }}
        />
      )}

      {children}
    </section>
  );
}
