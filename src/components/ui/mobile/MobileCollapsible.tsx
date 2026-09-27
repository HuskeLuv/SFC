'use client';

import React, { useState, type ReactNode } from 'react';

/**
 * Bloco recolhível do celular (PWA fase 3), IMUNE À IMPRESSÃO:
 * - o cabeçalho (<button aria-expanded>) é `hidden mscreen:flex` — só existe na TELA abaixo de lg,
 *   nunca na impressão;
 * - o conteúdo fechado leva `mscreen:hidden` (e não `hidden`): fecha só na tela; ao imprimir,
 *   sempre aberto (o PDF sai igual ao do desktop).
 *
 * Só o cabeçalho leva `data-mf-mobile` (o conteúdo aparece na impressão; `data-mf-collapsible`
 * marca o conteúdo para os guardas de desktop).
 *
 * Quem usa só o monta no ramo `useIsBelowLg` e esconde o título da própria seção com
 * `mscreen:hidden` (o título do cabeçalho o substitui na tela).
 */

export interface MobileCollapsibleProps {
  /** id do conteúdo (aria-controls). */
  id: string;
  title: ReactNode;
  /** Resumo à direita do título (ex.: "3 alertas"). */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function MobileCollapsible({
  id,
  title,
  summary,
  defaultOpen = false,
  children,
}: MobileCollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        data-mf-mobile=""
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="hidden min-h-[52px] w-full items-center gap-3 rounded-xl text-left mscreen:flex"
      >
        <span className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900 dark:text-white/90">
          {title}
        </span>
        {summary ? (
          <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">{summary}</span>
        ) : null}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 text-gray-500 motion-safe:transition-transform dark:text-gray-400 ${
            open ? 'rotate-180' : ''
          }`}
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div id={id} data-mf-collapsible="" className={open ? '' : 'mscreen:hidden'}>
        {children}
      </div>
    </div>
  );
}

export default MobileCollapsible;
