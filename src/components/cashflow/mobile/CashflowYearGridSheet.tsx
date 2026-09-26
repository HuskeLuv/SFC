'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { lockBodyScroll } from '@/lib/ui/scrollLock';
import { MOBILE_MEDIA_QUERY } from '@/lib/ui/mobile';
import { shouldHandleLayerEvent, useTopLayer } from '@/components/ui/sheet/layerStack';

/**
 * "Ano inteiro" do Fluxo de caixa no celular (PWA fase 2, protótipo cenário f).
 *
 * Decisão do Wellington (26/09/2026): SÓ LEITURA em tela cheia; tocar no nome do mês chama
 * `onPickMonth` (quem monta fecha e abre aquele mês na visão do mês). `onPickCell` fica no
 * contrato, sem uso.
 *
 * Reaproveita a planilha de desktop (`DataTableTwo` em `presentation='mobile-year'`): o CSS de
 * `[data-mf-year-grid]` (globals.css) deixa só a coluna de itens (128px, fixa), os meses (84px) e o
 * Total do ano como última coluna, sem fixar. A rolagem horizontal acontece só dentro da grade.
 *
 * Camada própria (não é BottomSheet): portal no body, `role=dialog` + `aria-modal`, Esc só quando
 * é o topo da pilha (`useTopLayer`), foco preso e devolvido ao gatilho, trava de rolagem da página.
 */

export interface CashflowYearGridSheetProps {
  isOpen: boolean;
  onClose(): void;
  year: number;
  /** Mês em foco na visão do mês (0 = Jan … 11 = Dez). */
  month: number;
  onPickMonth(m: number): void;
  onPickCell?(itemId: string, groupId: string, m: number): void;
}

/** Planilha carregada só quando a grade abre (dnd-kit e as linhas de desktop ficam fora do chunk). */
const DataTableTwo = dynamic(() => import('@/components/tables/DataTables/TableTwo/DataTableTwo'), {
  ssr: false,
  loading: () => (
    <div
      aria-busy="true"
      className="flex flex-1 items-center justify-center text-sm text-gray-500 dark:text-gray-400"
    >
      Carregando a planilha…
    </div>
  ),
});

/** Largura da coluna de mês (5.25rem): as setas rolam 3 meses. */
const MONTH_PX = 84;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const HEAD_BUTTON =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-700 active:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0079F2] dark:text-gray-200 dark:active:bg-white/5';

function Icon({ path }: { path: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={path}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export default function CashflowYearGridSheet({
  isOpen,
  onClose,
  year,
  month,
  onPickMonth,
}: CashflowYearGridSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const triggerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  if (isOpen && !wasOpenRef.current && typeof document !== 'undefined') {
    triggerRef.current = document.activeElement as HTMLElement | null;
  }
  wasOpenRef.current = isOpen;
  const { layerId } = useTopLayer(isOpen);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const trigger = triggerRef.current;
    const release = lockBodyScroll();
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Tab') return;
      if (!shouldHandleLayerEvent(layerId, event)) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    // Passou para lg (tablet girado, janela redimensionada): a grade é só do celular.
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
      // Devolve o foco ao gatilho se ele ainda existe e ninguém já moveu o foco (a visão do mês
      // pode focar o nome do mês depois de `onPickMonth`).
      const active = document.activeElement;
      if (trigger?.isConnected && (!active || active === document.body)) trigger.focus();
    };
  }, [isOpen, layerId]);

  const scrollMonths = useCallback((direction: -1 | 1) => {
    const scroller = panelRef.current?.querySelector<HTMLElement>('[data-mf-year-grid-scroll]');
    if (!scroller) return;
    scroller.scrollBy({
      left: direction * 3 * MONTH_PX,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, []);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Fluxo de caixa — ano inteiro"
      data-mf-overlay=""
      data-mf-year-grid=""
      className="fixed inset-0 z-[99990] flex flex-col bg-white pt-[env(safe-area-inset-top)] lg:hidden dark:bg-gray-900"
    >
      <div className="flex h-12 shrink-0 items-center gap-0.5 border-b border-gray-200 px-1 dark:border-gray-800">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Fechar o ano inteiro e voltar ao mês"
          className={HEAD_BUTTON}
        >
          <Icon path="M6 6l12 12M18 6L6 18" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold text-gray-800 dark:text-white/90">
          {year} · ano inteiro
        </h2>
        <button
          type="button"
          onClick={() => scrollMonths(-1)}
          aria-label="Meses anteriores"
          className={HEAD_BUTTON}
        >
          <Icon path="M15 5l-7 7 7 7" />
        </button>
        <button
          type="button"
          onClick={() => scrollMonths(1)}
          aria-label="Próximos meses"
          className={HEAD_BUTTON}
        >
          <Icon path="M9 5l7 7-7 7" />
        </button>
      </div>

      <p className="hidden shrink-0 items-center gap-2 px-4 pt-2 text-[12.5px] text-gray-600 portrait:flex dark:text-gray-400">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M11 18h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span>Gire o celular para ver mais meses. Toque no nome de um mês para abri-lo.</span>
      </p>

      <div className="flex min-h-0 flex-1 flex-col px-2 pt-2 pb-[env(safe-area-inset-bottom)]">
        <DataTableTwo presentation="mobile-year" initialMonth={month} onPickMonth={onPickMonth} />
      </div>
    </div>,
    document.body,
  );
}

export { CashflowYearGridSheet };
