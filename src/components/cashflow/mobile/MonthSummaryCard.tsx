'use client';

import React from 'react';
import { formatBRL, formatPct } from '@/utils/format';

/**
 * Cartão "Saldo de {mês}" da visão do mês (PWA fase 2, protótipo cenário a): saldo do mês em
 * destaque (azul positivo / vermelho negativo), Poupança do mês, Entradas e Despesas, barra
 * despesas ÷ entradas e o Saldo Conta Corrente do mês anterior. Abaixo de 360px fica compacto
 * (padding 12, número de 22px, sem a barra).
 */

export interface MonthSummaryCardProps {
  monthName: string;
  saldo: number;
  entradas: number;
  despesas: number;
  /** Índice de Poupança Mensal (%); `null` sem entradas. */
  poupanca: number | null;
  /** Saldo Conta Corrente Mês Anterior; `null` = não calculável. */
  saldoCcAnterior: number | null;
}

export const VALUE_POS = 'text-mf-patrimonio dark:text-mf-tranquilidade';
export const VALUE_NEG = 'text-[#D92D20] dark:text-[#F97066]';

/** Cor do número com sinal (zero fica neutro). */
export function signClass(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (value < -0.004) return VALUE_NEG;
  if (value > 0.004) return VALUE_POS;
  return '';
}

export default function MonthSummaryCard({
  monthName,
  saldo,
  entradas,
  despesas,
  poupanca,
  saldoCcAnterior,
}: MonthSummaryCardProps) {
  const despesasPct = entradas > 0 ? Math.min(100, (despesas / entradas) * 100) : 0;
  return (
    <section
      aria-label={`Resumo de ${monthName.toLowerCase()}`}
      className="rounded-2xl border border-gray-200 bg-white p-4 max-[359px]:p-3 dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-gray-500 dark:text-gray-400">
            Saldo de {monthName.toLowerCase()}
          </p>
          <p
            className={`text-[28px] leading-tight font-semibold tabular-nums max-[359px]:text-[22px] ${
              signClass(saldo) || 'text-gray-800 dark:text-white/90'
            }`}
          >
            {formatBRL(saldo)}
          </p>
        </div>
        {poupanca !== null ? (
          <span
            title="Índice de Poupança Mensal"
            className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold whitespace-nowrap tabular-nums ${
              poupanca < 0
                ? 'border border-[#D92D20]/40 text-[#D92D20] dark:border-[#F97066]/40 dark:text-[#F97066]'
                : 'bg-mf-patrimonio/10 text-mf-patrimonio dark:bg-mf-tranquilidade/15 dark:text-mf-tranquilidade'
            }`}
          >
            Poupança {formatPct(poupanca, 0)}
          </span>
        ) : null}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 max-[359px]:mt-2">
        <div className="min-w-0">
          <dt className="text-xs text-gray-500 dark:text-gray-400">Entradas</dt>
          <dd className="truncate text-[15px] font-semibold text-gray-800 tabular-nums dark:text-white/90">
            {formatBRL(entradas)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-gray-500 dark:text-gray-400">Despesas</dt>
          <dd className="truncate text-[15px] font-semibold text-gray-800 tabular-nums dark:text-white/90">
            {formatBRL(despesas)}
          </dd>
        </div>
      </dl>

      <div
        aria-hidden="true"
        className="mt-2.5 flex h-2 gap-0.5 overflow-hidden rounded bg-gray-200 max-[359px]:hidden dark:bg-[#2E3440]"
      >
        <i className="block h-full bg-mf-tranquilidade" style={{ width: `${despesasPct}%` }} />
        {entradas > 0 ? <i className="block h-full flex-1 bg-[#0079F2]" /> : null}
      </div>

      <div className="mt-2.5 flex items-baseline justify-between gap-2 border-t border-gray-100 pt-2.5 text-[13px] text-gray-600 tabular-nums max-[359px]:mt-2 max-[359px]:pt-2 dark:border-gray-800 dark:text-gray-300">
        <span className="min-w-0">Saldo Conta Corrente do mês anterior</span>
        <b className={`font-semibold whitespace-nowrap ${signClass(saldoCcAnterior)}`}>
          {saldoCcAnterior === null ? '–' : formatBRL(saldoCcAnterior)}
        </b>
      </div>
    </section>
  );
}

export { MonthSummaryCard };
