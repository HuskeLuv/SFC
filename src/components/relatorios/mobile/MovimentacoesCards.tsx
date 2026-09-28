'use client';

import React, { useState } from 'react';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import type { Movimentacao } from '../MovimentacoesTable';

/**
 * Movimentações do período no celular (PWA fase 3): as 5 mais recentes em cartões e "Ver as n"
 * para abrir o resto. Montado só no ramo `useIsBelowLg` (`hidden mscreen:block`); a tabela, que
 * imprime TODAS, continua no DOM.
 */

export const MOVIMENTACOES_INICIAIS = 5;

const brl = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtData = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export default function MovimentacoesCards({
  movimentacoes,
  totalNoPeriodo,
}: {
  movimentacoes: Movimentacao[];
  totalNoPeriodo: number;
}) {
  const [todas, setTodas] = useState(false);
  const visiveis = todas ? movimentacoes : movimentacoes.slice(0, MOVIMENTACOES_INICIAIS);
  const escondidas = movimentacoes.length - visiveis.length;

  return (
    <div data-mf-mobile="">
      <ul className={TABLE_MOBILE_STYLES.list}>
        {visiveis.map((mov) => (
          <li key={mov.id} data-mf-card="" className={TABLE_MOBILE_STYLES.card}>
            <div className={TABLE_MOBILE_STYLES.cardHeader}>
              <div className="min-w-0">
                <p className={`${TABLE_MOBILE_STYLES.cardTitle} break-words`}>{mov.ativo}</p>
                <p className={TABLE_MOBILE_STYLES.cardSubtitle}>
                  {fmtData(mov.data)} · {mov.operacao === 'compra' ? 'Compra' : 'Venda'}
                  {mov.jaInvestido ? ' · já investido' : ''}
                </p>
              </div>
              <p className={`${TABLE_MOBILE_STYLES.valuePrimary} shrink-0`}>{brl(mov.total)}</p>
            </div>
          </li>
        ))}
      </ul>
      {escondidas > 0 ? (
        <button
          type="button"
          onClick={() => setTodas(true)}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-700 active:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:active:bg-white/5"
        >
          Ver as {movimentacoes.length}
        </button>
      ) : null}
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        {totalNoPeriodo > movimentacoes.length
          ? `Exibindo as ${movimentacoes.length} movimentações mais recentes de ${totalNoPeriodo} no período.`
          : `${totalNoPeriodo} ${totalNoPeriodo === 1 ? 'movimentação' : 'movimentações'} no período.`}
      </p>
    </div>
  );
}
