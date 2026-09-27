'use client';

import React from 'react';
import type { LinhaTaxa } from '../DadosEconomicos';
import { formatPercent, taxaMensal } from '../utils';

/**
 * Dados econômicos no celular (PWA fase 3): uma linha por indicador com a taxa anual e o
 * equivalente mensal embaixo — as MESMAS linhas da tabela. Sem verde: ganho real positivo no azul
 * da paleta, negativo no vermelho. Montado só no ramo `useIsBelowLg` (`hidden mscreen:block`).
 */
export default function DadosEconomicosCards({ linhas }: { linhas: LinhaTaxa[] }) {
  return (
    <ul data-mf-mobile="" className="divide-y divide-gray-100 dark:divide-gray-800">
      {linhas.map((l) => {
        const cor =
          l.destaque && l.aa != null
            ? l.aa >= 0
              ? 'text-mf-patrimonio dark:text-mf-tranquilidade'
              : 'text-[#D92D20] dark:text-[#F97066]'
            : 'text-gray-900 dark:text-white/90';
        return (
          <li key={l.chave} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p
                className={`text-sm ${
                  l.destaque
                    ? 'font-semibold text-gray-900 dark:text-white/90'
                    : 'text-gray-700 dark:text-gray-200'
                }`}
              >
                {l.label}
              </p>
              {l.nota ? <p className="text-xs text-gray-500 dark:text-gray-400">{l.nota}</p> : null}
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-sm font-semibold tabular-nums ${cor}`}>
                {formatPercent(l.aa, 2)} a.a.
              </p>
              <p className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {formatPercent(taxaMensal(l.aa), 2)} a.m.
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
