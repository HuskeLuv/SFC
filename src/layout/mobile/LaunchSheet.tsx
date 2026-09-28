'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import type { NavItem } from '@/layout/navigation';
import {
  QUICK_LAUNCH_ACTIONS,
  requestQuickLaunch,
  type QuickLaunchAction,
  type QuickLaunchId,
} from './quickLaunch';

/** Atalhos disponíveis para os itens de menu do usuário (perfil/personificação). */
export function getAvailableQuickLaunchActions(items: NavItem[]): QuickLaunchAction[] {
  const names = new Set(items.map((item) => item.name));
  return QUICK_LAUNCH_ACTIONS.filter((action) => names.has(action.requires));
}

function ActionIcon({ id }: { id: QuickLaunchId }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    'aria-hidden': true,
  } as const;
  const stroke = {
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  if (id === 'novo-ativo') {
    return (
      <svg {...common}>
        <path d="M4 17l5-5 4 4 7-7" {...stroke} />
        <path d="M15 9h5v5" {...stroke} />
      </svg>
    );
  }
  if (id === 'resgate') {
    return (
      <svg {...common}>
        <path d="M4 7l5 5 4-4 7 7" {...stroke} />
        <path d="M15 15h5v-5" {...stroke} />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="4" y="4" width="16" height="16" rx="3" {...stroke} />
      <path d="M8 10h8M8 14h5" {...stroke} />
    </svg>
  );
}

/**
 * "+ Lançar": Novo investimento e Resgatar abrem os wizards da Carteira (/carteira?acao=...);
 * Despesa ou receita (PWA fase 2) fecha este sheet e abre o lançamento rápido do Fluxo, em
 * qualquer tela (`onOpenCashflowLaunch`).
 */
export default function LaunchSheet({
  isOpen,
  onClose,
  actions,
  onOpenCashflowLaunch,
}: {
  isOpen: boolean;
  onClose: () => void;
  actions: QuickLaunchAction[];
  /** "Despesa ou receita": chamado depois de fechar este sheet. */
  onOpenCashflowLaunch?: () => void;
}) {
  const pathname = usePathname();

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="O que você quer lançar?">
      <ul className="flex flex-col gap-2 pt-1">
        {actions.map((action) => {
          const iconBox =
            'flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-mf-outside/10 text-mf-outside dark:bg-mf-tranquilidade/15 dark:text-mf-tranquilidade';
          const text = (
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-gray-800 dark:text-white/90">
                {action.label}
              </span>
              <span className="block text-[13px] leading-snug text-gray-500 dark:text-gray-400">
                {action.description}
              </span>
            </span>
          );

          const rowClass =
            'flex min-h-14 w-full items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-left active:bg-gray-100 dark:border-gray-800 dark:bg-white/[0.03] dark:active:bg-white/5';
          const chevron = (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="shrink-0 text-gray-400"
            >
              <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          );

          if (action.kind === 'sheet') {
            return (
              <li key={action.id}>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => {
                    onClose();
                    onOpenCashflowLaunch?.();
                  }}
                  className={rowClass}
                >
                  <span className={iconBox}>
                    <ActionIcon id={action.id} />
                  </span>
                  {text}
                  {chevron}
                </button>
              </li>
            );
          }

          const href = action.href;
          const targetPath = href.split('?')[0];
          return (
            <li key={action.id}>
              <Link
                href={href}
                onClick={(event) => {
                  onClose();
                  // Já na Carteira o Link não remontaria a página (e deixaria o ?acao na URL):
                  // cancela a navegação e pede o atalho (evento + pendente, que a Carteira
                  // ainda carregando consome ao montar).
                  if (pathname === targetPath) {
                    event.preventDefault();
                    requestQuickLaunch(action.id);
                  }
                }}
                className={rowClass}
              >
                <span className={iconBox}>
                  <ActionIcon id={action.id} />
                </span>
                {text}
                {chevron}
              </Link>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}
