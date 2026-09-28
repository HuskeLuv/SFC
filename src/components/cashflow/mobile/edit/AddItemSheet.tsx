'use client';

import React, { useId, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import type { CashflowMutations } from '@/hooks/useCashflowMutations';
import { validateNewRow } from '@/utils/validation';
import {
  MOBILE_FIELD_CLASS,
  MOBILE_FIELD_ERROR_CLASS,
  MOBILE_FIELD_ERROR_TEXT_CLASS,
  MOBILE_FIELD_HINT_CLASS,
  MOBILE_FIELD_LABEL_CLASS,
} from '@/components/ui/sheet/MobileNumberField';
import { PrimaryButton, SaveError, SecondaryButton, SheetFooter } from './sheetUi';

/**
 * "Nova linha" do grupo (PWA fase 2, protótipo d3): nome + "O seu porquê" → `createItem` (POST
 * /api/cashflow/items, histórico `item.criar`), com refetch. Depois de criada, quem usa abre o
 * sheet da célula da linha nova no mês.
 */

const CREATE_ERROR = 'Não foi possível criar a linha. Tente de novo.';

export interface AddItemSheetProps {
  group: CashflowGroup;
  mutations: CashflowMutations;
  onBack(): void;
  onCreated(item: CashflowItem): void;
  setBusy(busy: boolean): void;
}

export function AddItemSheet({ group, mutations, onBack, onCreated, setBusy }: AddItemSheetProps) {
  const baseId = useId();
  const formId = `${baseId}-form`;
  const nameId = `${baseId}-nome`;
  const [name, setName] = useState('');
  const [significado, setSignificado] = useState('');
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
    setSaving(true);
    setBusy(true);
    setSaveError(null);
    let created: CashflowItem | null = null;
    try {
      created = await mutations.createItem(group.id, name.trim(), significado.trim() || undefined, {
        refetch: true,
      });
    } catch {
      created = null;
    }
    setSaving(false);
    setBusy(false);
    if (!created?.id) {
      setSaveError(CREATE_ERROR);
      return;
    }
    onCreated(created);
  };

  return (
    <>
      <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 pb-3">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">em {group.name}</p>
        <div>
          <label htmlFor={nameId} className={MOBILE_FIELD_LABEL_CLASS}>
            Nome da linha
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            maxLength={255}
            autoFocus
            enterKeyHint="next"
            autoComplete="off"
            placeholder="Ex.: Academia"
            disabled={saving}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(null);
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
            O seu porquê <span className="font-normal text-gray-500">(opcional)</span>
          </label>
          <textarea
            id={`${baseId}-porque`}
            value={significado}
            maxLength={1000}
            rows={3}
            disabled={saving}
            onChange={(e) => setSignificado(e.target.value)}
            className={twMerge(MOBILE_FIELD_CLASS, 'h-auto min-h-[80px] py-3')}
          />
          <p className={MOBILE_FIELD_HINT_CLASS}>
            A linha começa sem valores. Depois é só preencher o mês.
          </p>
        </div>
      </form>
      <SheetFooter>
        <SaveError message={saveError} />
        <div className="flex gap-2">
          <SecondaryButton onClick={onBack} disabled={saving}>
            Voltar
          </SecondaryButton>
          <PrimaryButton form={formId} busy={saving} busyLabel="Adicionando…">
            Adicionar
          </PrimaryButton>
        </div>
      </SheetFooter>
    </>
  );
}

export default AddItemSheet;
