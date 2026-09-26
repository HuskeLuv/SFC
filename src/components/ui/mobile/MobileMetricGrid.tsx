import React, { type ReactNode } from 'react';
import { MobileStatusPill, type MobileStatusTone } from './MobileStatusPill';

/**
 * Grade 2×2 de números do celular (PWA fase 3): rótulo de 12px e valor de 18px (16px abaixo de
 * 360px). Raiz com `data-mf-mobile` (quem usa já está no ramo mobile).
 */

export interface MobileMetricItem {
  label: ReactNode;
  value: ReactNode;
  /** Selo ponto + palavra abaixo do valor (sem verde). */
  tone?: MobileStatusTone;
  hint?: ReactNode;
}

export interface MobileMetricGridProps {
  items: MobileMetricItem[];
  className?: string;
}

export function MobileMetricGrid({ items, className = '' }: MobileMetricGridProps) {
  return (
    <dl data-mf-mobile="" className={`grid grid-cols-2 gap-2 ${className}`}>
      {items.map((item, i) => (
        <div
          key={i}
          className="min-w-0 rounded-2xl border border-gray-200 bg-white px-3.5 py-3 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <dt className="truncate text-xs text-gray-500 dark:text-gray-400">{item.label}</dt>
          <dd className="mt-1 truncate text-lg font-semibold tabular-nums text-gray-900 max-[359px]:text-base dark:text-white/90">
            {item.value}
          </dd>
          {item.tone && item.hint ? (
            <dd className="mt-1">
              <MobileStatusPill tone={item.tone}>{item.hint}</MobileStatusPill>
            </dd>
          ) : item.hint ? (
            <dd className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.hint}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

export default MobileMetricGrid;
