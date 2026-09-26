'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface MobileSaveToastProps {
  /** Texto do aviso (ex.: 'Objetivo salvo'). `null` = fechado. */
  message: string | null;
  /** Tempo na tela (padrão 4s; 6s com `action`). */
  durationMs?: number;
  onDismiss: () => void;
  /**
   * Ação opcional ao lado do texto (PWA fase 2: "Desfazer" do lançamento rápido). Tocar nela
   * chama `onClick` e fecha o aviso.
   */
  action?: { label: string; onClick: () => void };
}

const CHECK_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5 12.5l4.5 4.5L19 7.5"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Aviso "salvo" do celular (PWA fase 1), acima da barra de abas. `role=status` +
 * `aria-live=polite`; some sozinho em `durationMs` ou no toque. Só abaixo de lg.
 *
 * Com `action` (PWA fase 2, só no lançamento rápido): o aviso vira um bloco com o texto e um botão
 * separado (alvo de 44px), na cor tranquilidade sobre potência (claro) / segurança sobre escolha
 * (escuro) — 4,78:1 e 7,94:1. Sem `action`, o DOM é o mesmo da fase 1.
 */
export function MobileSaveToast({ message, durationMs, onDismiss, action }: MobileSaveToastProps) {
  const onDismissRef = useRef(onDismiss);
  const actionRef = useRef(action);
  useEffect(() => {
    onDismissRef.current = onDismiss;
    actionRef.current = action;
  }, [onDismiss, action]);
  const hasAction = !!action;
  const duration = durationMs ?? (hasAction ? 6000 : 4000);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => onDismissRef.current(), duration);
    return () => window.clearTimeout(timer);
  }, [message, duration]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      data-mf-save-toast=""
      className="pointer-events-none fixed inset-x-4 z-[99992] flex justify-center lg:hidden"
      style={{ bottom: 'calc(64px + env(safe-area-inset-bottom) + 8px)' }}
    >
      {message && action ? (
        <div className="pointer-events-auto flex min-h-11 max-w-full items-center gap-2 rounded-xl bg-mf-potencia py-1 pr-1 pl-4 text-sm font-medium text-white shadow-lg motion-safe:animate-[mf-fade-in_180ms_ease-out] dark:bg-mf-escolha dark:text-mf-potencia">
          {CHECK_ICON}
          <span className="min-w-0 flex-1 py-1.5">{message}</span>
          <button
            type="button"
            onClick={() => {
              actionRef.current?.onClick();
              onDismissRef.current();
            }}
            className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-mf-tranquilidade active:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#0079F2] dark:text-mf-seguranca dark:active:bg-black/5"
          >
            {action.label}
          </button>
        </div>
      ) : message ? (
        <button
          type="button"
          onClick={() => onDismissRef.current()}
          className="pointer-events-auto flex min-h-11 max-w-full items-center gap-2 rounded-xl bg-mf-potencia px-4 py-2.5 text-left text-sm font-medium text-white shadow-lg motion-safe:animate-[mf-fade-in_180ms_ease-out] dark:bg-mf-escolha dark:text-mf-potencia"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="min-w-0">{message}</span>
        </button>
      ) : null}
    </div>,
    document.body,
  );
}

export default MobileSaveToast;
