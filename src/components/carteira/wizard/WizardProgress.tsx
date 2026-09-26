'use client';

import React from 'react';

interface WizardProgressProps {
  /** Títulos das etapas VISÍVEIS do fluxo atual (3 a 5), na ordem. */
  steps: string[];
  /** Índice (base 0) da etapa atual dentro de `steps`. */
  current: number;
}

/**
 * Progresso do wizard no celular (PWA fase 1): um segmento por etapa real do fluxo e o texto
 * "Etapa n de N · Título". Vai no `headerExtra` do Sidebar (só abaixo de lg); o desktop mantém a
 * barra antiga.
 */
export default function WizardProgress({ steps, current }: WizardProgressProps) {
  const total = steps.length;
  const index = Math.min(Math.max(current, 0), Math.max(total - 1, 0));
  const title = steps[index] ?? '';
  const n = index + 1;

  return (
    <div data-mf-wizard-progress="" className="px-4 pb-2.5 pt-1">
      <div
        role="progressbar"
        aria-label="Progresso do cadastro"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={n}
        aria-valuetext={`Etapa ${n} de ${total}: ${title}`}
        className="flex gap-1"
      >
        {steps.map((step, i) => (
          <span
            key={`${i}-${step}`}
            data-mf-progress-segment={i <= index ? 'done' : 'todo'}
            className={`h-1 flex-1 rounded-full ${
              i <= index ? 'bg-[#0079F2]' : 'bg-gray-200 dark:bg-gray-700'
            }`}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-400">
        Etapa {n} de {total} ·{' '}
        <b className="font-semibold text-gray-800 dark:text-gray-100">{title}</b>
      </p>
    </div>
  );
}
