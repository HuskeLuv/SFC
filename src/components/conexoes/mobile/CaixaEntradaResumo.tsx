'use client';

import React from 'react';

/**
 * Cartão-resumo da Caixa de entrada na tela de Conexões (celular, PWA fase 3). As contagens vêm
 * da MESMA query da Caixa de entrada (página 1, `useCaixaEntrada`); tocar abre a tela própria
 * (`?caixa=1`, com o voltar do sistema).
 */

export interface CaixaEntradaContagens {
  /** Total de transações para revisar (todas as páginas). */
  total: number;
  /** Com sugestão de linha ("Lançar sugeridas"). */
  sugeridas: number;
  /** Transferências/investimentos ("Ignorar transferências"). */
  transferencias: number;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export default function CaixaEntradaResumo({
  contagens,
  onOpen,
}: {
  contagens: CaixaEntradaContagens;
  onOpen(): void;
}) {
  const { total, sugeridas, transferencias } = contagens;
  if (total === 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-mf-mobile=""
      data-caixa-resumo=""
      className="flex w-full flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left active:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:active:bg-white/5"
    >
      <span className="flex w-full items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mf-tranquilidade/15 text-mf-patrimonio dark:bg-mf-tranquilidade/20 dark:text-mf-tranquilidade"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 13h4l1.5 3h5L16 13h4M5 5h14l1 8v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5l1-8Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-800 dark:text-white/90">
            Caixa de entrada · {plural(total, 'para revisar', 'para revisar')}
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            Confirme a linha do fluxo de caixa de cada transação
          </span>
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="shrink-0 text-gray-400"
        >
          <path
            d="M9 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="flex flex-wrap gap-2">
        {[
          plural(sugeridas, 'sugerida', 'sugeridas'),
          plural(transferencias, 'transferência', 'transferências'),
        ].map((t) => (
          <span
            key={t}
            className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-white/5 dark:text-gray-300"
          >
            {t}
          </span>
        ))}
      </span>
    </button>
  );
}
