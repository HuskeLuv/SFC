'use client';

import React, { type ReactNode } from 'react';
import BottomSheet from './BottomSheet';

/**
 * Menu de ações "⋯" do celular (PWA fase 3): um BottomSheet com uma linha de 52px por ação.
 * Quem usa já está no ramo mobile (`useIsBelowLg`); o desktop mantém os botões de hoje.
 *
 * Ao escolher, o sheet FECHA e só então chama `onSelect` (no próximo microtask): uma confirmação
 * aberta pela ação (useResponsiveConfirm) empilha limpa, sem o menu por baixo.
 */

export interface MobileAction {
  id: string;
  label: string;
  onSelect(): void;
  /** Ação destrutiva (vermelho #D92D20/#F97066). */
  danger?: boolean;
  disabled?: boolean;
  /** Linha secundária (ex.: por que está desabilitada). */
  hint?: ReactNode;
  icon?: ReactNode;
}

export interface MobileActionSheetProps {
  isOpen: boolean;
  onClose(): void;
  title: ReactNode;
  /** Sobre o que são as ações (ex.: nome da dívida), acima da lista. */
  subject?: ReactNode;
  actions: MobileAction[];
}

export function MobileActionSheet({
  isOpen,
  onClose,
  title,
  subject,
  actions,
}: MobileActionSheetProps) {
  const select = (action: MobileAction) => {
    if (action.disabled) return;
    onClose();
    queueMicrotask(() => action.onSelect());
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <div data-mf-action-sheet="" className="pb-2">
        {subject ? (
          <p className="mb-2 truncate text-sm text-gray-500 dark:text-gray-400">{subject}</p>
        ) : null}
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {actions.map((action) => (
            <li key={action.id}>
              <button
                type="button"
                disabled={action.disabled}
                onClick={() => select(action)}
                className={`flex min-h-[52px] w-full items-center gap-3 px-1 py-2 text-left text-base font-medium active:bg-gray-100 disabled:opacity-50 dark:active:bg-white/5 ${
                  action.danger
                    ? 'text-[#D92D20] dark:text-[#F97066]'
                    : 'text-gray-800 dark:text-white/90'
                }`}
              >
                {action.icon ? (
                  <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center">
                    {action.icon}
                  </span>
                ) : null}
                <span className="flex min-w-0 flex-col">
                  <span>{action.label}</span>
                  {action.hint ? (
                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                      {action.hint}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </BottomSheet>
  );
}

export interface MobileMoreButtonProps {
  onClick(): void;
  /** Nome acessível (padrão 'Mais ações'). */
  label?: string;
}

/** Botão "⋯" de 44×44 que abre o MobileActionSheet. */
export function MobileMoreButton({ onClick, label = 'Mais ações' }: MobileMoreButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-haspopup="dialog"
      data-mf-mobile=""
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-600 active:bg-gray-100 dark:text-gray-300 dark:active:bg-white/5"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="12" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="19" cy="12" r="1.8" />
      </svg>
    </button>
  );
}

export default MobileActionSheet;
