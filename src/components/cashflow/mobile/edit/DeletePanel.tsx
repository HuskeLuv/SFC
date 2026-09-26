'use client';

import React, { useState } from 'react';
import { formatBRL } from '@/utils/format';
import {
  InfoNote,
  PrimaryButton,
  SAVE_FAILED_MESSAGE,
  SaveError,
  SecondaryButton,
  SheetFooter,
} from './sheetUi';
import type { CellPanelProps } from './CellSheet';

/**
 * Painel "Excluir linha" (PWA fase 2): confirmação no PRÓPRIO sheet (nada de window.confirm nem
 * sheet empilhado), dizendo que não tem Desfazer. Linha de sonho avisa que o objetivo do
 * Planejamento também é apagado (o texto do desktop). Grava pelo batch-update (`deletes`).
 */

/** Texto do desktop (EditableItemRow) para excluir linha de sonho. */
export const SONHO_DELETE_TEXT =
  'Esta linha é um sonho do Planejamento. Excluir aqui também remove o objetivo e todo o histórico dele.';

export function DeletePanel({
  year,
  item,
  group,
  caps,
  values,
  mutations,
  goTo,
  close,
  onSaved,
  setBusy,
}: CellPanelProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const filled = values.filter((v) => v !== 0).length;
  const total = values.reduce((a, b) => a + b, 0);

  const handleDelete = async () => {
    if (saving) return;
    setSaving(true);
    setBusy(true);
    setSaveError(null);
    let failure: string | null = null;
    try {
      const res = await mutations.saveItemChanges({
        groupId: item.groupId || group.id,
        deletes: [item.id],
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
    onSaved('Linha excluída');
  };

  return (
    <>
      <div className="flex flex-col gap-3 pb-3">
        <p className="text-[15px] font-semibold text-gray-800 dark:text-white/90">
          Excluir {item.name}?
        </p>
        <InfoNote tone="warn">
          {caps.deleteNeedsObjetivoConfirm && (
            <p className="mb-1.5">
              {SONHO_DELETE_TEXT} O sonho também será apagado do Planejamento.
            </p>
          )}
          <p>
            Os valores do ano somem
            {filled > 0
              ? ` (${filled} ${filled === 1 ? 'mês' : 'meses'} de ${year}, ${formatBRL(total)})`
              : ''}
            . <b>Não dá para desfazer</b>: para voltar, será preciso criar a linha de novo.
          </p>
        </InfoNote>
      </div>
      <SheetFooter>
        <SaveError message={saveError} />
        <div className="flex gap-2">
          <SecondaryButton onClick={() => goTo('valor')} disabled={saving}>
            Voltar
          </SecondaryButton>
          <PrimaryButton onClick={handleDelete} busy={saving} busyLabel="Excluindo…" danger>
            Excluir linha
          </PrimaryButton>
        </div>
      </SheetFooter>
    </>
  );
}

export default DeletePanel;
