'use client';

import React, { useEffect, useRef, type ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';

/**
 * Abas da carteira que viram segmentado/chips abaixo de lg (PWA fase 1).
 *
 * Desktop (≥ lg): as MESMAS strings de classe de hoje — `MainTabButton` do CarteiraTabs (variant
 * `main`) e `TabButton` de CarteiraResumo/CarteiraAnalise/ProventosTabs/IRTabs (`underline` e
 * `segmented-sub`), copiadas literalmente (o teste compara). Abaixo de lg a troca é por JS
 * (`useIsBelowLg`), para o desktop não receber nenhuma classe nova:
 * - `main`: segmentado Resumo | Análise (38px + 3px de padding = 44px de toque);
 * - `underline`: trilho de chips (`chipRail`, `data-mf-scroll-x`) com `leading` fixo antes;
 * - `segmented-sub`: segmentado para sub-abas curtas (ex.: Consolidado | Agenda).
 *
 * Sempre <button> (sem role=tab: os e2e usam getByRole('button', { name })) com nome acessível =
 * label atual e `aria-current="page"` no ativo.
 */

export interface ResponsiveTab {
  id: string;
  label: string;
  /** Rótulo curto só no celular (o nome acessível continua sendo `label`). */
  mobileLabel?: string;
  /** Classe sem ativos: mais apagada no celular, mas continua tocável. */
  muted?: boolean;
}

export type ResponsiveTabNavVariant = 'main' | 'underline' | 'segmented-sub';

export interface ResponsiveTabNavProps {
  tabs: ResponsiveTab[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  variant: ResponsiveTabNavVariant;
  /** Conteúdo fixo antes dos chips (celular, `underline`): ex. o botão "Todas". */
  leading?: ReactNode;
  /** Gruda no topo, sob o cabeçalho mobile (só celular). */
  sticky?: boolean;
  /** Classe extra do <nav> (nas duas larguras). */
  className?: string;
  /** Substitui a classe de desktop do <nav> (cada tela tem a sua variação de scrollbar). */
  navClassName?: string;
}

// ── Desktop: strings idênticas às de hoje ──────────────────────────────────────────────────

/** `MainTabButton` (CarteiraTabs). */
export const DESKTOP_MAIN_TAB_BASE =
  'inline-flex items-center rounded-t-xl px-6 py-3 text-sm font-semibold transition-all duration-200 ease-in-out whitespace-nowrap';
export const DESKTOP_MAIN_TAB_ACTIVE =
  'bg-gray-900 text-white dark:bg-gray-800 dark:text-gray-100 shadow-md';
export const DESKTOP_MAIN_TAB_INACTIVE =
  'bg-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50';

/** `TabButton` (CarteiraResumo, CarteiraAnalise, ProventosTabs, IRTabs). */
export const DESKTOP_UNDERLINE_TAB_BASE =
  'inline-flex items-center border-b-2 px-3 py-3 text-sm font-medium transition-colors duration-200 ease-in-out whitespace-nowrap';
export const DESKTOP_UNDERLINE_TAB_ACTIVE =
  'text-brand-500 dark:text-brand-400 border-brand-500 dark:border-brand-400';
export const DESKTOP_UNDERLINE_TAB_INACTIVE =
  'bg-transparent text-gray-500 border-transparent hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200';

/** <nav> do CarteiraTabs. */
export const DESKTOP_MAIN_NAV = 'flex space-x-1';
/** <nav> do CarteiraResumo/CarteiraAnalise. */
export const DESKTOP_UNDERLINE_NAV =
  '-mb-px flex space-x-2 overflow-x-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 dark:[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:h-1.5';

/** A className exata que o botão de hoje renderiza (template literal `${base} ${estado}`). */
export function desktopTabClassName(variant: ResponsiveTabNavVariant, isActive: boolean): string {
  if (variant === 'main') {
    return `${DESKTOP_MAIN_TAB_BASE} ${isActive ? DESKTOP_MAIN_TAB_ACTIVE : DESKTOP_MAIN_TAB_INACTIVE}`;
  }
  return `${DESKTOP_UNDERLINE_TAB_BASE} ${
    isActive ? DESKTOP_UNDERLINE_TAB_ACTIVE : DESKTOP_UNDERLINE_TAB_INACTIVE
  }`;
}

// ── Celular ─────────────────────────────────────────────────────────────────────────────────

export const MOBILE_SEGMENTED_NAV = 'flex rounded-xl bg-gray-100 p-[3px] dark:bg-white/[0.06]';
export const MOBILE_SEGMENTED_BUTTON =
  'inline-flex h-[38px] flex-1 items-center justify-center rounded-[9px] px-3 text-sm font-semibold whitespace-nowrap motion-safe:transition-colors';
export const MOBILE_SEGMENTED_ACTIVE =
  'bg-white text-gray-900 shadow-sm dark:bg-[#26262A] dark:text-white';
export const MOBILE_SEGMENTED_INACTIVE = 'text-gray-600 dark:text-gray-400';
export const MOBILE_STICKY =
  'sticky top-[var(--mf-header-h,0px)] z-20 bg-gray-50 py-1 dark:bg-[#18181B]';

export function mobileTabClassName(
  variant: ResponsiveTabNavVariant,
  isActive: boolean,
  muted = false,
): string {
  if (variant === 'underline') {
    return twMerge(
      TABLE_MOBILE_STYLES.chip,
      isActive && TABLE_MOBILE_STYLES.chipActive,
      muted && !isActive && 'opacity-60',
    );
  }
  return twMerge(
    MOBILE_SEGMENTED_BUTTON,
    isActive ? MOBILE_SEGMENTED_ACTIVE : MOBILE_SEGMENTED_INACTIVE,
    muted && !isActive && 'opacity-60',
  );
}

export function ResponsiveTabNav({
  tabs,
  activeId,
  onChange,
  ariaLabel,
  variant,
  leading,
  sticky = false,
  className,
  navClassName,
}: ResponsiveTabNavProps) {
  const isBelowLg = useIsBelowLg();
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Celular: centraliza a aba ativa no trilho ao trocar.
  useEffect(() => {
    if (!isBelowLg || variant !== 'underline') return;
    const el = activeRef.current;
    const rail = el?.parentElement;
    if (!el || !rail || typeof rail.scrollTo !== 'function') return;
    rail.scrollTo({
      left: el.offsetLeft - (rail.clientWidth - el.clientWidth) / 2,
      behavior: 'smooth',
    });
  }, [activeId, isBelowLg, variant]);

  if (!isBelowLg) {
    const desktopNav =
      navClassName ?? (variant === 'main' ? DESKTOP_MAIN_NAV : DESKTOP_UNDERLINE_NAV);
    return (
      <nav aria-label={ariaLabel} className={className ? `${desktopNav} ${className}` : desktopNav}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              className={desktopTabClassName(variant, isActive)}
              onClick={() => onChange(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    );
  }

  const nav = (
    <nav
      aria-label={ariaLabel}
      data-mf-scroll-x={variant === 'underline' ? '' : undefined}
      className={twMerge(
        variant === 'underline' ? TABLE_MOBILE_STYLES.chipRail : MOBILE_SEGMENTED_NAV,
        className,
      )}
    >
      {variant === 'underline' && leading}
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        const short = tab.mobileLabel && tab.mobileLabel !== tab.label;
        return (
          <button
            key={tab.id}
            ref={isActive ? activeRef : undefined}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            aria-label={short ? tab.label : undefined}
            className={mobileTabClassName(variant, isActive, tab.muted)}
            onClick={() => onChange(tab.id)}
          >
            {short ? tab.mobileLabel : tab.label}
          </button>
        );
      })}
    </nav>
  );

  return sticky ? <div className={MOBILE_STICKY}>{nav}</div> : nav;
}

export default ResponsiveTabNav;
