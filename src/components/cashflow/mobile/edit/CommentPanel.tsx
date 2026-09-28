'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { CashflowRequestError } from '@/hooks/useCashflowMutations';
import {
  MOBILE_FIELD_CLASS,
  MOBILE_FIELD_HINT_CLASS,
  MOBILE_FIELD_LABEL_CLASS,
} from '@/components/ui/sheet/MobileNumberField';
import { MONTH_NAMES } from '@/components/cashflow/mobile/MonthStepper';
import { PrimaryButton, SaveError, SecondaryButton, SheetFooter } from './sheetUi';
import type { CellPanelProps } from './CellSheet';

/**
 * Painel "comentário" do sheet da célula (PWA fase 2): mesmo GET/PATCH /api/cashflow/comments do
 * CommentModal do desktop (via useCashflowMutations). Vazio apaga o comentário (null).
 */

/** Limite do servidor (`cashflowCommentSchema`). */
export const COMMENT_MAX_LENGTH = 1000;

const SESSION_MESSAGE =
  'Sua sessão expirou ou está inválida. Por favor, faça logout e login novamente.';
const COMMENT_SAVE_ERROR = 'Não foi possível salvar o comentário. Tente de novo.';

export function CommentPanel({
  month,
  item,
  groupLabel,
  mutations,
  goTo,
  close,
  onSaved,
  setBusy,
}: CellPanelProps) {
  const fieldId = useId();
  const formId = `${fieldId}-form`;
  const original = item.values?.find((v) => v.month === month)?.comment ?? '';
  const [text, setText] = useState(original);
  const [baseline, setBaseline] = useState(original);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const touched = useRef(false);

  // Busca o comentário atual (e a data), como o desktop; se o usuário ainda não digitou, usa ele.
  const { fetchCellComment } = mutations;
  useEffect(() => {
    let alive = true;
    fetchCellComment(item.id, month)
      .then(({ comment, updatedAt: at }) => {
        if (!alive) return;
        setUpdatedAt(at);
        setBaseline(comment ?? '');
        if (!touched.current) setText(comment ?? '');
      })
      .catch(() => {
        // sem rede: fica o comentário que veio na árvore
      });
    return () => {
      alive = false;
    };
  }, [fetchCellComment, item.id, month]);

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (saving) return;
    const next = text.trim();
    if (next === baseline.trim()) {
      goTo('valor');
      return;
    }
    setSaving(true);
    setBusy(true);
    setSaveError(null);
    let failure: string | null = null;
    try {
      await mutations.saveCellComment(item.id, month, next || null);
    } catch (error: unknown) {
      if (error instanceof CashflowRequestError && error.status === 401) {
        failure = error.message || SESSION_MESSAGE;
      } else {
        failure = (error instanceof Error && error.message) || COMMENT_SAVE_ERROR;
      }
    }
    setSaving(false);
    setBusy(false);
    if (failure) {
      setSaveError(failure);
      return;
    }
    close();
    onSaved(next ? 'Comentário salvo' : 'Comentário apagado', { itemId: item.id, month });
  };

  return (
    <>
      <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-2 pb-3">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{groupLabel}</p>
        <label htmlFor={fieldId} className={twMerge(MOBILE_FIELD_LABEL_CLASS, 'mt-1')}>
          Comentário de {MONTH_NAMES[month]}
        </label>
        <textarea
          id={fieldId}
          value={text}
          maxLength={COMMENT_MAX_LENGTH}
          rows={5}
          autoFocus
          disabled={saving}
          enterKeyHint="enter"
          onChange={(e) => {
            touched.current = true;
            setText(e.target.value);
            if (saveError) setSaveError(null);
          }}
          aria-describedby={`${fieldId}-dica`}
          className={twMerge(MOBILE_FIELD_CLASS, 'h-auto min-h-[120px] py-3')}
        />
        <p id={`${fieldId}-dica`} className={MOBILE_FIELD_HINT_CLASS}>
          {text.length}/{COMMENT_MAX_LENGTH} · deixe em branco para apagar
          {updatedAt ? ` · atualizado em ${updatedAt.toLocaleDateString('pt-BR')}` : ''}
        </p>
      </form>
      <SheetFooter>
        <SaveError message={saveError} />
        <div className="flex gap-2">
          <SecondaryButton onClick={() => goTo('valor')} disabled={saving}>
            Voltar
          </SecondaryButton>
          <PrimaryButton form={formId} busy={saving}>
            Salvar
          </PrimaryButton>
        </div>
      </SheetFooter>
    </>
  );
}

export default CommentPanel;
