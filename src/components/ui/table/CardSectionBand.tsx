'use client';

import React, { type ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import { TABLE_MOBILE_STYLES } from './tableStyles';

export interface CardSectionBandProps {
  /** id do bloco que a faixa abre/fecha (vai no `aria-controls`). */
  id: string;
  label: ReactNode;
  /** Subtotal já formatado (ex.: 'R$ 12.345,67'). */
  subtotal?: ReactNode;
  /** Quantidade de ativos da seção ('1 ativo' / 'N ativos'). */
  count?: number;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * Faixa de seção recolhível da lista de cartões (PWA fase 1 — Value/Growth/Risk, tipos de Renda
 * Fixa…). Par mobile da `sectionRow` da tabela, com contraste AA (`sectionBandButton`).
 */
export function CardSectionBand({
  id,
  label,
  subtotal,
  count,
  expanded,
  onToggle,
  className,
}: CardSectionBandProps) {
  return (
    <button
      type="button"
      data-mf-section=""
      aria-expanded={expanded}
      aria-controls={id}
      onClick={onToggle}
      className={twMerge(TABLE_MOBILE_STYLES.sectionBandButton, className)}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className={twMerge(
          'shrink-0 motion-safe:transition-transform motion-safe:duration-150',
          expanded && 'rotate-90',
        )}
      >
        <path
          d="M9 6l6 6-6 6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="shrink-0 text-xs font-medium opacity-80">
          {count} {count === 1 ? 'ativo' : 'ativos'}
        </span>
      )}
      {subtotal !== undefined && subtotal !== null && (
        <span className="shrink-0 tabular-nums">{subtotal}</span>
      )}
    </button>
  );
}

export default CardSectionBand;
