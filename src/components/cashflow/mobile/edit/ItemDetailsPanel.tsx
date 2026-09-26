'use client';

import React, { useId, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import type { CashflowItemUpdate } from '@/hooks/useCashflowMutations';
import { validateNewRow } from '@/utils/validation';
import {
  MOBILE_FIELD_CLASS,
  MOBILE_FIELD_ERROR_CLASS,
  MOBILE_FIELD_ERROR_TEXT_CLASS,
  MOBILE_FIELD_HINT_CLASS,
  MOBILE_FIELD_LABEL_CLASS,
} from '@/components/ui/sheet/MobileNumberField';
import {
  PrimaryButton,
  SAVE_FAILED_MESSAGE,
  SaveError,
  SecondaryButton,
  SheetFooter,
} from './sheetUi';
import type { CellPanelProps } from './CellSheet';

/**
 * Painel "Renomear e porquê" do sheet da célula (PWA fase 2): nome, "O seu porquê" e nível de
 * prioridade num único update do batch-update — o mesmo caminho da edição por grupo do desktop.
 * Linhas de sonho/dívida não chegam aqui (`editStructure`).
 */

/** Limites do servidor (`cashflowBatchUpdateSchema`). */
const NAME_MAX = 255;
const SIGNIFICADO_MAX = 1000;
const RANK_MAX = 255;

/** O update da linha com só o que mudou; `null` = nada mudou. */
export function buildItemDetailsUpdate(
  item: { id: string; name: string; significado: string | null; rank: string | null },
  next: { name: string; significado: string; rank: string },
): CashflowItemUpdate | null {
  const update: CashflowItemUpdate = { itemId: item.id };
  const name = next.name.trim();
  const significado = next.significado.trim() || null;
  const rank = next.rank.trim() || null;
  let changed = false;
  if (name !== item.name) {
    update.name = name;
    changed = true;
  }
  if (significado !== (item.significado || null)) {
    update.significado = significado;
    changed = true;
  }
  if (rank !== (item.rank || null)) {
    update.rank = rank;
    changed = true;
  }
  return changed ? update : null;
}

export function ItemDetailsPanel({
  item,
  group,
  mutations,
  goTo,
  close,
  onSaved,
  setBusy,
  month,
}: CellPanelProps) {
  const baseId = useId();
  const formId = `${baseId}-form`;
  const [name, setName] = useState(item.name);
  const [significado, setSignificado] = useState(item.significado ?? '');
  const [rank, setRank] = useState(item.rank ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (saving) return;
    const invalid = validateNewRow({ name, significado });
    if (invalid) {
      setNameError(invalid === 'Nome obrigatório.' ? 'Dê um nome para a linha.' : invalid);
      return;
    }
    const update = buildItemDetailsUpdate(item, { name, significado, rank });
    if (!update) {
      goTo('valor');
      return;
    }
    setSaving(true);
    setBusy(true);
    setSaveError(null);
    let failure: string | null = null;
    try {
      const res = await mutations.saveItemChanges({
        groupId: item.groupId || group.id,
        updates: [update],
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
    onSaved('Linha salva', { itemId: item.id, month });
  };

  const nameId = `${baseId}-nome`;
  return (
    <>
      <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 pb-3">
        <div>
          <label htmlFor={nameId} className={MOBILE_FIELD_LABEL_CLASS}>
            Nome da linha
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            maxLength={NAME_MAX}
            autoFocus
            enterKeyHint="next"
            autoComplete="off"
            disabled={saving}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(null);
              if (saveError) setSaveError(null);
            }}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${nameId}-erro` : undefined}
            className={twMerge(MOBILE_FIELD_CLASS, nameError && MOBILE_FIELD_ERROR_CLASS)}
          />
          {nameError && (
            <p id={`${nameId}-erro`} role="alert" className={MOBILE_FIELD_ERROR_TEXT_CLASS}>
              {nameError}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${baseId}-porque`} className={MOBILE_FIELD_LABEL_CLASS}>
            O seu porquê
          </label>
          <textarea
            id={`${baseId}-porque`}
            value={significado}
            maxLength={SIGNIFICADO_MAX}
            rows={3}
            disabled={saving}
            placeholder="Por que esse gasto existe? Ex.: contrato até mar/2027"
            onChange={(e) => setSignificado(e.target.value)}
            className={twMerge(MOBILE_FIELD_CLASS, 'h-auto min-h-[88px] py-3')}
          />
        </div>
        <div>
          <label htmlFor={`${baseId}-nivel`} className={MOBILE_FIELD_LABEL_CLASS}>
            Nível de prioridade
          </label>
          <input
            id={`${baseId}-nivel`}
            type="text"
            value={rank}
            maxLength={RANK_MAX}
            disabled={saving}
            autoComplete="off"
            enterKeyHint="done"
            placeholder="Ex.: 1, Alta, Essencial"
            onChange={(e) => setRank(e.target.value)}
            aria-describedby={`${baseId}-nivel-dica`}
            className={MOBILE_FIELD_CLASS}
          />
          <p id={`${baseId}-nivel-dica`} className={MOBILE_FIELD_HINT_CLASS}>
            A mesma coluna &quot;Nível&quot; da planilha. Em branco = sem nível.
          </p>
        </div>
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

export default ItemDetailsPanel;
