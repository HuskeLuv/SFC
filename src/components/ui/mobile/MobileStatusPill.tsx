import React, { type ReactNode } from 'react';

/**
 * Selo de status do celular (PWA fase 3): PONTO + PALAVRA, sem verde (decisão 4 da fase 3).
 * - ok: ponto #0079F2 (só elemento não textual) + texto #396CAA / #6E9DC4;
 * - atencao: ponto e texto âmbar (#D97706/#FBBF24 ponto, #B45309/#FBBF24 texto — exceção aceita);
 * - problema: vermelho #D92D20 / #F97066;
 * - neutro: cinza.
 */

export type MobileStatusTone = 'ok' | 'atencao' | 'problema' | 'neutro';

export const STATUS_PILL_TONES: Record<MobileStatusTone, { dot: string; text: string }> = {
  ok: { dot: 'bg-[#0079F2]', text: 'text-mf-patrimonio dark:text-mf-tranquilidade' },
  atencao: { dot: 'bg-[#D97706] dark:bg-[#FBBF24]', text: 'text-[#B45309] dark:text-[#FBBF24]' },
  problema: { dot: 'bg-[#D92D20] dark:bg-[#F97066]', text: 'text-[#D92D20] dark:text-[#F97066]' },
  neutro: { dot: 'bg-gray-400 dark:bg-gray-500', text: 'text-gray-600 dark:text-gray-400' },
};

export interface MobileStatusPillProps {
  tone: MobileStatusTone;
  children: ReactNode;
  className?: string;
}

export function MobileStatusPill({ tone, children, className = '' }: MobileStatusPillProps) {
  const t = STATUS_PILL_TONES[tone];
  return (
    <span
      data-mf-status={tone}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${t.text} ${className}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${t.dot}`} />
      {children}
    </span>
  );
}

export default MobileStatusPill;
