'use client';

import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { lockBodyScroll } from '@/lib/ui/scrollLock';
import { MOBILE_MEDIA_QUERY } from '@/lib/ui/mobile';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Título visível (vira o nome acessível do diálogo). */
  title?: React.ReactNode;
  /** Nome acessível quando não há título visível. */
  ariaLabel?: string;
  children: React.ReactNode;
  /** Rodapé fixo (ações). Recebe a área segura de baixo. */
  footer?: React.ReactNode;
  className?: string;
  /** Conteúdo extra à esquerda do título (ex.: ícone do app). */
  titleAdornment?: React.ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Painel que sobe de baixo (PWA fase 0), só abaixo de lg. Portal no body, `aria-modal` (o que
 * também esconde a casca mobile pelo contrato do globals.css), Esc e toque no fundo fecham,
 * foco preso no painel e devolvido ao gatilho ao fechar. Sem arrastar para fechar nesta fase.
 * Fecha sozinho quando a janela passa a lg (tablet girado, janela redimensionada): o painel some
 * pelo `lg:hidden`, mas a trava de rolagem continuaria prendendo a página do desktop.
 *
 * Teclado (PWA fase 1): o Safari do iOS não encolhe a janela com o teclado, e o painel fixo em
 * `bottom-0` ficaria embaixo dele. Com o teclado aberto o painel sobe `inset` px e a altura máxima
 * passa a ser a da área visível (`useKeyboardInset`, via visualViewport).
 */
export default function BottomSheet({
  isOpen,
  onClose,
  title,
  ariaLabel,
  children,
  footer,
  className = '',
  titleAdornment,
}: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  // Gatilho guardado no render da abertura: o autoFocus do conteúdo (campo do MobileEditSheet)
  // roda antes do efeito abaixo, e aí o activeElement já seria o próprio campo.
  const triggerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  if (isOpen && !wasOpenRef.current && typeof document !== 'undefined') {
    triggerRef.current = document.activeElement as HTMLElement | null;
  }
  wasOpenRef.current = isOpen;
  const isBelowLg = useIsBelowLg();
  const keyboard = useKeyboardInset(isOpen && isBelowLg);
  const keyboardStyle: React.CSSProperties | undefined =
    keyboard.inset > 0 && keyboard.height !== null
      ? { bottom: keyboard.inset, maxHeight: `calc(${keyboard.height}px - 1rem)` }
      : undefined;
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const trigger = triggerRef.current;
    const release = lockBodyScroll();
    // Não rouba o foco de um campo com autoFocus (o teclado do celular abre sozinho).
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.getAttribute('aria-disabled') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const mobileQuery =
      typeof window.matchMedia === 'function' ? window.matchMedia(MOBILE_MEDIA_QUERY) : null;
    const onBreakpoint = () => {
      if (mobileQuery && !mobileQuery.matches) onCloseRef.current();
    };
    mobileQuery?.addEventListener('change', onBreakpoint);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      mobileQuery?.removeEventListener('change', onBreakpoint);
      release();
      if (trigger && typeof trigger.focus === 'function' && document.contains(trigger)) {
        trigger.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[99990] animate-[mf-fade-in_220ms_ease-out] bg-mf-potencia/45 lg:hidden"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        data-mf-sheet=""
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        tabIndex={-1}
        style={keyboardStyle}
        className={`fixed inset-x-0 bottom-0 z-[99991] flex max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] animate-[mf-sheet-in_260ms_cubic-bezier(.2,.8,.2,1)] flex-col rounded-t-3xl bg-white outline-none dark:bg-gray-900 lg:hidden ${className}`}
      >
        <div className="flex h-7 shrink-0 items-center justify-center" aria-hidden="true">
          <span className="h-[5px] w-9 rounded-full bg-mf-transparencia dark:bg-gray-700" />
        </div>
        <div className="flex shrink-0 items-center gap-2 pr-2 pb-1.5 pl-5">
          {titleAdornment}
          {title ? (
            <h2
              id={titleId}
              className="min-w-0 flex-1 truncate text-lg font-semibold text-gray-800 dark:text-white/90"
            >
              {title}
            </h2>
          ) : (
            <span className="flex-1" />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-500 active:bg-gray-100 dark:text-gray-400 dark:active:bg-white/5"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div
          className={`flex-1 overflow-y-auto overscroll-contain px-4 ${
            footer ? '' : 'pb-[calc(env(safe-area-inset-bottom)+8px)]'
          }`}
        >
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-gray-100 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)] dark:border-gray-800">
            {footer}
          </div>
        ) : null}
      </div>
    </>,
    document.body,
  );
}
