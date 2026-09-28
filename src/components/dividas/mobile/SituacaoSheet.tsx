'use client';

import React, { useRef, type KeyboardEvent } from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { MobileStatusPill } from '@/components/ui/mobile/MobileStatusPill';
import type { DividaStatus } from '@/hooks/useDividas';
import { SITUACOES, dividaSituacao } from './dividaSituacao';

interface SituacaoSheetProps {
  isOpen: boolean;
  onClose: () => void;
  status: DividaStatus;
  /** O MESMO handleStatusChange do select do desktop. */
  onSelect: (status: DividaStatus) => void;
  disabled?: boolean;
}

/**
 * Situação da dívida em sheet (PWA fase 3, só no celular): radiogroup com os status de hoje
 * (STATUS_LABELS) e uma linha dizendo o que cada um faz. Escolher troca e fecha.
 */
export default function SituacaoSheet({
  isOpen,
  onClose,
  status,
  onSelect,
  disabled = false,
}: SituacaoSheetProps) {
  const groupRef = useRef<HTMLDivElement | null>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = index + 1;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = index - 1;
    if (next === null) return;
    event.preventDefault();
    const radios = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    if (!radios?.length) return;
    radios[(next + radios.length) % radios.length]?.focus();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Situação da dívida">
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label="Situação"
        className="divide-y divide-gray-100 pb-2 dark:divide-gray-800"
      >
        {SITUACOES.map((s, index) => {
          const info = dividaSituacao(s);
          const checked = s === status;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              disabled={disabled}
              onKeyDown={(event) => onKeyDown(event, index)}
              onClick={() => {
                if (s !== status) onSelect(s);
                onClose();
              }}
              className="flex min-h-[60px] w-full items-center gap-3 px-1 py-2.5 text-left disabled:opacity-50"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <MobileStatusPill tone={info.tone} className="text-sm">
                  {info.label}
                </MobileStatusPill>
                <span className="text-xs text-gray-500 dark:text-gray-400">{info.descricao}</span>
              </span>
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  checked
                    ? 'border-mf-patrimonio dark:border-mf-tranquilidade'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                {checked ? (
                  <span className="h-3 w-3 rounded-full bg-mf-patrimonio dark:bg-mf-tranquilidade" />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
