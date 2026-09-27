'use client';

import React from 'react';
import { CATEGORIA_LABELS } from '@/lib/carteiraCategoryColors';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import type { PosicaoSecao } from '../PosicaoConsolidada';

/**
 * Posição consolidada no celular (PWA fase 3): uma faixa por categoria com subtotal e % da
 * carteira, os ativos (maior valor primeiro) e o total geral — os MESMOS números da tabela.
 * Montado só no ramo `useIsBelowLg` (`hidden mscreen:block`); a tabela é que imprime.
 */

const brl = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const pctOf = (v: number, total: number): string =>
  total > 0
    ? `${((v / total) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    : '—';

export default function PosicaoConsolidadaCards({
  secoes,
  totalGeral,
}: {
  secoes: PosicaoSecao[];
  totalGeral: number;
}) {
  return (
    <div data-mf-mobile="" className="space-y-4">
      {secoes.map((secao) => {
        const subtotal = secao.ativos.reduce((s, a) => s + a.valorAtual, 0);
        const label = CATEGORIA_LABELS[secao.categoria] ?? secao.categoria;
        return (
          <section key={secao.categoria} aria-label={label} className="space-y-1">
            <div className={`${TABLE_MOBILE_STYLES.groupBand} gap-3`}>
              <span className="min-w-0 truncate">{label}</span>
              <span className="shrink-0 tabular-nums">
                {brl(subtotal)} · {pctOf(subtotal, totalGeral)}
              </span>
            </div>
            <ul className="divide-y divide-gray-100 px-1 dark:divide-gray-800">
              {secao.ativos
                .slice()
                .sort((a, b) => b.valorAtual - a.valorAtual)
                .map((ativo) => (
                  <li
                    key={ativo.portfolioId}
                    className="flex items-start justify-between gap-3 py-2 text-sm"
                  >
                    <span className="min-w-0 break-words text-gray-700 dark:text-gray-200">
                      {ativo.nome}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-medium tabular-nums text-gray-900 dark:text-white/90">
                        {brl(ativo.valorAtual)}
                      </span>
                      <span className="block text-xs tabular-nums text-gray-500 dark:text-gray-400">
                        {pctOf(ativo.valorAtual, totalGeral)}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        );
      })}
      <div
        className={`${TABLE_MOBILE_STYLES.totalCard} flex items-center justify-between gap-3 text-sm`}
      >
        <span className="font-semibold">Total Geral</span>
        <span className="shrink-0 text-right font-semibold tabular-nums">
          {brl(totalGeral)} · 100%
        </span>
      </div>
    </div>
  );
}
