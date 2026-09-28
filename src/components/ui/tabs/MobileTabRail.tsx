'use client';

import React, { useEffect, useRef, type KeyboardEvent } from 'react';
import { twMerge } from 'tailwind-merge';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import { MOBILE_SEGMENTED_NAV, MOBILE_STICKY } from './ResponsiveTabNav';

/**
 * Trilho de abas/filtros SÓ do celular (PWA fase 3). Quem usa já está no ramo `useIsBelowLg` — o
 * desktop continua com o JSX de hoje (este componente não tem metade de desktop).
 *
 * - `variant='chips'`: trilho com rolagem própria (`data-mf-scroll-x`), chip visual de 36px com
 *   44px de toque (::before), rola até o ativo;
 * - `variant='segmented'`: segmentado de 44px, raio 12 (mesmo fundo do ResponsiveTabNav).
 *
 * Semântica (`semantics`):
 * - `'tabs'`: role=tablist/tab + aria-selected, setas ←/→ movem o foco (roving tabindex) — troca
 *   conteúdo dentro da página;
 * - `'filter'`: botões com aria-pressed (filtra uma lista);
 * - `'nav'`: aria-current="page" (muda a URL).
 *
 * Rótulo visível = `mobileLabel ?? label` (sem emoji); o nome acessível é o rótulo visível
 * (+ " (n)" com `count`).
 */

export interface MobileTabRailTab {
  id: string;
  label: string;
  mobileLabel?: string;
  count?: number;
  muted?: boolean;
}

export interface MobileTabRailProps {
  tabs: MobileTabRailTab[];
  activeId: string;
  onChange(id: string): void;
  ariaLabel: string;
  variant: 'chips' | 'segmented';
  /** 'tabs' = role=tablist/tab + aria-selected (troca conteúdo na página); 'filter' = aria-pressed; 'nav' = aria-current=page (muda URL). */
  semantics: 'tabs' | 'filter' | 'nav';
  sticky?: boolean;
  className?: string;
}

export const MOBILE_RAIL_SEGMENTED_BUTTON =
  'inline-flex min-h-11 flex-1 items-center justify-center rounded-[9px] px-3 text-sm font-medium whitespace-nowrap motion-safe:transition-colors';
export const MOBILE_RAIL_SEGMENTED_ACTIVE =
  'bg-white font-semibold text-gray-900 shadow-sm dark:bg-[#3A3F4A] dark:text-white';
export const MOBILE_RAIL_SEGMENTED_INACTIVE = 'text-gray-600 dark:text-gray-400';

/** Remove emoji e espaços que sobram (rótulos como '📊 Projeção'). */
export function stripEmoji(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function railTabClassName(
  variant: MobileTabRailProps['variant'],
  isActive: boolean,
  muted = false,
): string {
  if (variant === 'chips') {
    return twMerge(
      TABLE_MOBILE_STYLES.chip,
      isActive && TABLE_MOBILE_STYLES.chipActive,
      muted && !isActive && 'opacity-60',
    );
  }
  return twMerge(
    MOBILE_RAIL_SEGMENTED_BUTTON,
    isActive ? MOBILE_RAIL_SEGMENTED_ACTIVE : MOBILE_RAIL_SEGMENTED_INACTIVE,
    muted && !isActive && 'opacity-60',
  );
}

export function MobileTabRail({
  tabs,
  activeId,
  onChange,
  ariaLabel,
  variant,
  semantics,
  sticky = false,
  className,
}: MobileTabRailProps) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Chips: centraliza o ativo no trilho ao trocar.
  useEffect(() => {
    if (variant !== 'chips') return;
    const el = activeRef.current;
    const rail = railRef.current;
    if (!el || !rail || typeof rail.scrollTo !== 'function') return;
    rail.scrollTo({
      left: el.offsetLeft - (rail.clientWidth - el.clientWidth) / 2,
      behavior: 'smooth',
    });
  }, [activeId, variant]);

  const isTabs = semantics === 'tabs';

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!isTabs) return;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    const buttons = railRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
  };

  const rail = (
    <div
      ref={railRef}
      role={isTabs ? 'tablist' : undefined}
      aria-label={ariaLabel}
      data-mf-mobile=""
      data-mf-scroll-x={variant === 'chips' ? '' : undefined}
      className={twMerge(
        variant === 'chips' ? TABLE_MOBILE_STYLES.chipRail : `${MOBILE_SEGMENTED_NAV} gap-0.5`,
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeId;
        const visible = stripEmoji(tab.mobileLabel ?? tab.label);
        const name = tab.count != null ? `${visible} (${tab.count})` : visible;
        return (
          <button
            key={tab.id}
            ref={isActive ? activeRef : undefined}
            type="button"
            role={isTabs ? 'tab' : undefined}
            aria-selected={isTabs ? isActive : undefined}
            tabIndex={isTabs ? (isActive ? 0 : -1) : undefined}
            aria-pressed={semantics === 'filter' ? isActive : undefined}
            aria-current={semantics === 'nav' && isActive ? 'page' : undefined}
            aria-label={tab.count != null ? name : undefined}
            className={railTabClassName(variant, isActive, tab.muted)}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {visible}
            {tab.count != null ? (
              <span aria-hidden="true" className="ml-1 tabular-nums opacity-70">
                ({tab.count})
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  return sticky ? <div className={MOBILE_STICKY}>{rail}</div> : rail;
}

export default MobileTabRail;
