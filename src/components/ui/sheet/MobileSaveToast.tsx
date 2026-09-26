'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface MobileSaveToastProps {
  /** Texto do aviso (ex.: 'Objetivo salvo'). `null` = fechado. */
  message: string | null;
  /** Tempo na tela (padrão 4s). */
  durationMs?: number;
  onDismiss: () => void;
}

/**
 * Aviso "salvo" do celular (PWA fase 1), acima da barra de abas. Sem ação: a fase 1 não tem
 * Desfazer (decisão do Wellington, 25/09/2026). `role=status` + `aria-live=polite`; some sozinho
 * em `durationMs` ou no toque. Só abaixo de lg.
 */
export function MobileSaveToast({ message, durationMs = 4000, onDismiss }: MobileSaveToastProps) {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => onDismissRef.current(), durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      data-mf-save-toast=""
      className="pointer-events-none fixed inset-x-4 z-[99992] flex justify-center lg:hidden"
      style={{ bottom: 'calc(64px + env(safe-area-inset-bottom) + 8px)' }}
    >
      {message ? (
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
