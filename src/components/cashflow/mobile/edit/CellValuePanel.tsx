'use client';

import React, { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { twMerge } from 'tailwind-merge';
import type { CashflowValue } from '@/types/cashflow';
import type { CashflowValueChange } from '@/hooks/useCashflowMutations';
import { evaluateFormula, isFormula } from '@/utils/formulaParser';
import { formatDecimalInput, parseDecimalInput } from '@/lib/ui/numberInput';
import { formatBRL } from '@/utils/format';
import { cashflowColorCss, type CashflowColorValue } from '@/utils/cashflowColorLegend';
import { cellColorLabel, normalizeCellColor } from '@/lib/cashflow/cellColor';
import { READONLY_REASON_TEXT } from '@/lib/cashflow/itemCapabilities';
import { MONTH_NAMES } from '@/components/cashflow/mobile/MonthStepper';
import { FormulaKeyBar } from './FormulaKeyBar';
import { SituacaoPicker } from './SituacaoPicker';
import { YearMiniChart } from './YearMiniChart';
import {
  ActionRow,
  ICONS,
  InfoNote,
  PrimaryButton,
  SAVE_FAILED_MESSAGE,
  SaveError,
  SecondaryButton,
  SheetFooter,
  SheetSeparator,
} from './sheetUi';
import type { CellPanelProps } from './CellSheet';

/**
 * Painel "valor" do sheet da célula (PWA fase 2, protótipo cenários c/c2/e): valor do mês com o
 * teclado decimal + barra de fórmula, situação (cor), gráfico do ano e as ações da linha. Grava UMA
 * célula pelo mesmo batch-update do desktop (regra do `getChangesForGroup`). Fórmula inválida
 * trava o Salvar (o servidor a descartaria em silêncio).
 */

export type ParsedCellInput =
  | { ok: true; value: number; formula: string | null }
  | { ok: false; error: string };

export const NUMBER_ERROR = 'Use só números e vírgula (ou comece com = para uma fórmula).';

/** Texto do campo → valor (+ fórmula). Vazio = 0 (limpa a célula, como no desktop). */
export function parseCellInput(text: string): ParsedCellInput {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: 0, formula: null };
  if (isFormula(trimmed)) {
    const result = evaluateFormula(trimmed);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, value: result.value, formula: trimmed };
  }
  const value = parseDecimalInput(trimmed);
  if (value === null || !Number.isFinite(value)) return { ok: false, error: NUMBER_ERROR };
  return { ok: true, value, formula: null };
}

/** Texto inicial do campo: a fórmula, se houver; senão o valor formatado ('' para zero). */
export function initialCellText(original: CashflowValue | undefined): string {
  if (original?.formula) return original.formula;
  const value = original?.value ?? 0;
  return value === 0 ? '' : formatDecimalInput(value);
}

/**
 * A mudança da célula pela MESMA regra do `getChangesForGroup` (useGroupEditMode): entra se o
 * valor (±0,01), a cor ou a fórmula mudou, ou se há cor nova numa célula sem registro. `null` =
 * nada mudou (o sheet fecha sem request).
 */
export function buildCellValueChange(
  original: CashflowValue | undefined,
  month: number,
  next: { value: number; formula: string | null; color: string | null },
): CashflowValueChange | null {
  const hasOriginal = !!original;
  const originalValue = original?.value || 0;
  const originalColor = original?.color || null;
  const originalFormula = original?.formula || null;

  const valueChanged = Math.abs(next.value - originalValue) > 0.01;
  const colorChanged = next.color !== originalColor;
  const formulaChanged = next.formula !== originalFormula;
  const newColorWithoutRecord = next.color !== null && !hasOriginal;

  if (!valueChanged && !colorChanged && !formulaChanged && !newColorWithoutRecord) return null;

  const change: CashflowValueChange = { month, value: next.value };
  if (colorChanged || newColorWithoutRecord) change.color = next.color;
  if (formulaChanged) change.formula = next.formula;
  return change;
}

/** Cor a gravar: a escolhida (hex da legenda) ou, se o usuário não tocou, a original como está. */
export function resolveDraftColor(
  choice: CashflowColorValue | null | undefined,
  original: CashflowValue | undefined,
): string | null {
  if (choice === undefined) return original?.color || null;
  return choice ? cashflowColorCss(choice) : null;
}

const MONO_STYLE: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
};

export function CellValuePanel({
  year,
  month,
  item,
  group,
  groupLabel,
  caps,
  values,
  draft,
  setDraft,
  mutations,
  goTo,
  close,
  onSaved,
  setBusy,
  autoFocusField = true,
}: CellPanelProps & { autoFocusField?: boolean }) {
  const fieldId = useId();
  const resultId = `${fieldId}-resultado`;
  const hintId = `${fieldId}-dica`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const original = item.values?.find((v) => v.month === month);
  const monthName = MONTH_NAMES[month];
  const parsed = parseCellInput(draft.text);
  const formulaMode = isFormula(draft.text);
  const colorValue = draft.color === undefined ? normalizeCellColor(original?.color) : draft.color;
  const comment = original?.comment?.trim() || null;

  const setText = (text: string) => {
    setDraft((d) => ({ ...d, text }));
    if (saveError) setSaveError(null);
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (saving || !parsed.ok) return;
    const change = buildCellValueChange(original, month, {
      value: parsed.value,
      formula: parsed.formula,
      color: resolveDraftColor(draft.color, original),
    });
    if (!change) {
      close();
      return;
    }
    setSaving(true);
    setBusy(true);
    setSaveError(null);
    let failure: string | null = null;
    try {
      const res = await mutations.saveItemChanges({
        groupId: item.groupId || group.id,
        updates: [{ itemId: item.id, values: [change] }],
      });
      if (!res.ok) failure = res.error || SAVE_FAILED_MESSAGE;
    } catch {
      failure = SAVE_FAILED_MESSAGE;
    }
    setSaving(false);
    setBusy(false);
    if (failure) {
      setSaveError(failure);
      return;
    }
    close();
    onSaved('Valor salvo', { itemId: item.id, month });
  };

  const actions = (
    <div>
      {caps.canComment && (
        <ActionRow
          icon={ICONS.comment}
          title={comment ? 'Comentário' : 'Adicionar comentário'}
          description={comment ?? `Anotação de ${monthName}`}
          onClick={() => goTo('comentario')}
          disabled={saving}
        />
      )}
      {caps.editStructure && (
        <ActionRow
          icon={ICONS.edit}
          title="Renomear e porquê"
          description={item.significado || 'Nome, o seu porquê e nível de prioridade'}
          onClick={() => goTo('linha')}
          disabled={saving}
        />
      )}
      {caps.canMove && (
        <ActionRow
          icon={ICONS.move}
          title="Mover"
          description="Para cima, para baixo ou para outra seção"
          onClick={() => goTo('mover')}
          disabled={saving}
        />
      )}
      {caps.canDelete && (
        <ActionRow
          icon={ICONS.trash}
          title="Excluir linha"
          description="Some de todos os meses"
          onClick={() => goTo('excluir')}
          disabled={saving}
          danger
        />
      )}
    </div>
  );

  const hasActions = caps.canComment || caps.editStructure || caps.canMove || caps.canDelete;
  const reason = caps.readOnlyReason ? READONLY_REASON_TEXT[caps.readOnlyReason] : null;

  // Modo leitura: Aporte/Resgate (calculado) e sonho com ativos vinculados.
  if (!caps.editValues) {
    const situacao = cellColorLabel(original?.color);
    return (
      <div className="flex flex-col gap-3 pb-3">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{groupLabel}</p>
        <div className="flex min-h-[52px] items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]">
          <span className="min-w-0">
            <span className="block text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
              Valor de {monthName}
            </span>
            <span
              data-mf-cell-readonly-value=""
              className="block text-[22px] font-semibold text-gray-800 tabular-nums dark:text-white/90"
            >
              {formatBRL(original?.value ?? values[month] ?? 0)}
            </span>
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-right text-[12.5px] text-gray-500 dark:text-gray-400">
            {ICONS.lock}
            Somente leitura
          </span>
        </div>
        {reason && (
          <InfoNote>
            {reason}
            {caps.readOnlyReason === 'investimento' && (
              <> (aportes e resgates de {monthName}). Para mudar, edite a operação na Carteira.</>
            )}
          </InfoNote>
        )}
        {caps.readOnlyReason === 'investimento' && (
          <Link
            href="/carteira"
            className="inline-flex min-h-11 items-center gap-1 self-start px-1 text-[13.5px] font-semibold text-mf-patrimonio dark:text-mf-tranquilidade"
          >
            Abrir a Carteira {ICONS.chevron}
          </Link>
        )}
        {situacao && (
          <p className="text-sm text-gray-600 dark:text-gray-300">Situação: {situacao}</p>
        )}
        {comment && !caps.canComment && (
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Comentário</p>
            <p className="rounded-xl bg-gray-100 p-3 text-sm whitespace-pre-wrap text-gray-700 dark:bg-white/5 dark:text-gray-300">
              {comment}
            </p>
          </div>
        )}
        <SheetSeparator />
        <YearMiniChart name={item.name} year={year} values={values} month={month} />
        {hasActions && (
          <>
            <SheetSeparator />
            {actions}
          </>
        )}
      </div>
    );
  }

  const fieldError = !parsed.ok ? parsed.error : null;
  const before = original?.value ?? 0;
  let preview: React.ReactNode = null;
  if (formulaMode) {
    preview = parsed.ok ? (
      <>
        <span>Resultado</span>
        <b className="text-gray-800 dark:text-white/90">= {formatBRL(parsed.value)}</b>
      </>
    ) : (
      <span className="text-[#D92D20] dark:text-[#F97066]">{parsed.error}</span>
    );
  } else if (!parsed.ok) {
    preview = <span className="text-[#D92D20] dark:text-[#F97066]">{parsed.error}</span>;
  } else if (before !== 0 && Math.abs(parsed.value - before) > 0.01) {
    preview = (
      <>
        <span>Antes</span>
        <b className="text-gray-800 dark:text-white/90">{formatBRL(before)}</b>
      </>
    );
  }

  return (
    <>
      <form
        id={`${fieldId}-form`}
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-2 pb-3"
      >
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{groupLabel}</p>
        <label
          htmlFor={fieldId}
          className="mt-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Valor de {monthName}
        </label>
        <div
          className={twMerge(
            'flex min-h-16 items-center rounded-[14px] border bg-white px-3.5 focus-within:border-[#0079F2] focus-within:ring-[3px] focus-within:ring-[#0079F2]/25 dark:bg-gray-900',
            fieldError
              ? 'border-[#D92D20] dark:border-[#F97066]'
              : 'border-gray-300 dark:border-gray-700',
          )}
        >
          {formulaMode ? (
            <span
              className="mr-2 shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-sm text-gray-700 dark:bg-white/10 dark:text-gray-200"
              style={MONO_STYLE}
              aria-hidden="true"
            >
              ƒx
            </span>
          ) : (
            <span
              className="mr-2 shrink-0 text-[17px] text-gray-500 dark:text-gray-400"
              aria-hidden="true"
            >
              R$
            </span>
          )}
          <input
            ref={inputRef}
            id={fieldId}
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            autoFocus={autoFocusField}
            placeholder="0,00"
            value={draft.text}
            disabled={saving}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={`${resultId} ${hintId}`}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[26px] font-semibold text-gray-800 tabular-nums outline-none placeholder:text-gray-300 disabled:opacity-70 dark:text-white/90 dark:placeholder:text-gray-600"
          />
        </div>
        <div
          id={resultId}
          aria-live="polite"
          className="flex min-h-5 justify-between gap-2 px-1 text-[13px] text-gray-600 tabular-nums dark:text-gray-300"
        >
          {preview}
        </div>
        <FormulaKeyBar
          inputRef={inputRef}
          value={draft.text}
          onChange={setText}
          disabled={saving}
        />
        <p id={hintId} className="text-xs text-gray-500 dark:text-gray-400">
          Comece com = para somar parcelas, como na planilha: =100+50.
        </p>
        {caps.canColor && (
          <div className="mt-2">
            <SituacaoPicker
              value={colorValue}
              onChange={(c) => setDraft((d) => ({ ...d, color: c }))}
              disabled={saving}
            />
          </div>
        )}
        {reason && (
          <div className="mt-2">
            <InfoNote>{reason}</InfoNote>
          </div>
        )}
      </form>
      <SheetSeparator />
      <YearMiniChart name={item.name} year={year} values={values} month={month} />
      {hasActions && (
        <>
          <SheetSeparator />
          <div className="pb-2">{actions}</div>
        </>
      )}
      <SheetFooter>
        <SaveError message={saveError} />
        <div className="flex gap-2">
          <SecondaryButton onClick={close} disabled={saving}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton form={`${fieldId}-form`} busy={saving} disabled={!parsed.ok}>
            Salvar
          </PrimaryButton>
        </div>
      </SheetFooter>
    </>
  );
}

export default CellValuePanel;
