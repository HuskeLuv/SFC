'use client';

import React from 'react';

/**
 * Estados da visão do mês do Fluxo de caixa no celular (PWA fase 2, protótipo cenário j):
 * carregando (skeleton no formato da lista), erro (role=alert + Tentar de novo), mês sem nada
 * lançado e planilha do ano em branco.
 */

const PRIMARY_BTN =
  'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-mf-patrimonio px-4 text-sm font-semibold text-white active:bg-mf-seguranca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0079F2]';
const SECONDARY_BTN =
  'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 active:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0079F2] dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90 dark:active:bg-white/5';

const PlusIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const UploadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function Skel({ className }: { className: string }) {
  return (
    <div
      className={`rounded-lg bg-gray-200 motion-safe:animate-pulse motion-safe:[animation-duration:1.3s] dark:bg-[#26262A] ${className}`}
    />
  );
}

/** Skeleton no formato da lista (resumo, faixas e linhas). */
export function MonthViewSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Carregando o fluxo de caixa"
      role="status"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-2.5 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
        <Skel className="h-3 w-2/5" />
        <Skel className="h-8 w-3/5" />
        <Skel className="h-9 w-full" />
      </div>
      <Skel className="h-12 w-full rounded-[14px]" />
      <Skel className="h-11 w-full rounded-xl" />
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
        <Skel className="h-5 w-full" />
        <Skel className="h-5 w-full" />
        <Skel className="h-5 w-full" />
      </div>
      <Skel className="h-12 w-full rounded-[14px]" />
    </div>
  );
}

/** Falha ao carregar o ano. */
export function MonthViewError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-5 py-7 text-center">
      <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-[#D92D20]/10 text-[#D92D20] dark:bg-[#F97066]/15 dark:text-[#F97066]">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3 3l18 18M8.5 8.8A9.9 9.9 0 002 12.5M16.4 11a9.8 9.8 0 015.6 1.5M5 16a7 7 0 016.2-1.9M12 20h.01"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
        Não foi possível carregar o fluxo
      </h2>
      <p className="max-w-[30ch] text-sm text-gray-500 dark:text-gray-400">
        A conexão caiu no meio do caminho. Seus valores estão salvos; toque para tentar de novo.
      </p>
      <button type="button" onClick={onRetry} className={`${PRIMARY_BTN} w-auto`}>
        Tentar de novo
      </button>
    </div>
  );
}

/** Mês sem entradas nem despesas. `onLaunch` ausente = lançamento rápido indisponível. */
export function MonthEmptyNotice({
  monthName,
  onLaunch,
}: {
  monthName: string;
  onLaunch?: () => void;
}) {
  return (
    <div
      data-mf-fluxo-empty=""
      className="flex flex-col gap-2.5 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <p className="text-base font-semibold text-gray-800 dark:text-white/90">
        Nada lançado em {monthName.toLowerCase()} ainda
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {onLaunch
          ? 'Lance uma despesa ou receita, ou toque numa linha para preencher.'
          : 'Toque numa linha para preencher.'}
      </p>
      {onLaunch ? (
        <button type="button" onClick={onLaunch} className={PRIMARY_BTN}>
          <PlusIcon />
          Lançar despesa ou receita
        </button>
      ) : null}
    </div>
  );
}

/** Ano inteiro sem nada: lançar ou importar a planilha FLC. */
export function BlankPlanilha({
  year,
  onLaunch,
  onImport,
}: {
  year: number;
  onLaunch?: () => void;
  onImport: () => void;
}) {
  return (
    <div
      data-mf-fluxo-blank=""
      className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-6 text-center dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
        Sua planilha de {year} está em branco
      </h2>
      <p className="max-w-[32ch] text-sm text-gray-500 dark:text-gray-400">
        Comece lançando o salário e as contas do mês, ou traga tudo de uma vez pela planilha FLC.
      </p>
      <div className="flex w-full flex-col gap-2.5">
        {onLaunch ? (
          <button type="button" onClick={onLaunch} className={PRIMARY_BTN}>
            <PlusIcon />
            Lançar despesa ou receita
          </button>
        ) : null}
        <button type="button" onClick={onImport} className={SECONDARY_BTN}>
          <UploadIcon />
          Importar planilha (.xlsx)
        </button>
      </div>
    </div>
  );
}
