'use client';

import React from 'react';
import { CardSectionBand } from '@/components/ui/table/CardSectionBand';
import type { MonthGroup } from '@/lib/cashflow/monthViewModel';
import { formatBRL, formatPct } from '@/utils/format';

/**
 * Faixa de um grupo na visão do mês (PWA fase 2, protótipo cenário a), com os 3 níveis da
 * planilha: nível 1 = faixa sólida (patrimônio / segurança no escuro), nível 2 = CardSectionBand da
 * fase 1, nível 3 = cabeçalho de cartão em caixa alta. Toda faixa recolhe (mesmo estado do desktop)
 * e mostra o subtotal do mês; grupos com linhas próprias ganham o ⋯ "Ações do grupo".
 */

export interface MonthGroupBandProps {
  group: MonthGroup;
  expanded: boolean;
  onToggle: () => void;
  /** id do bloco que a faixa abre/fecha. */
  contentId: string;
  showAnnual: boolean;
  /** ⋯ "Ações do grupo" (ausente = sem o botão). */
  onActions?: () => void;
}

const DotsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);

const Caret = ({ expanded, size = 20 }: { expanded: boolean; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className={`shrink-0 motion-safe:transition-transform motion-safe:duration-[180ms] ${
      expanded ? '' : '-rotate-90'
    }`}
  >
    <path
      d="M6 9l6 6 6-6"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
    <path d="M8 11V8a4 4 0 118 0v3" stroke="currentColor" strokeWidth="2" />
  </svg>
);

/** "% da receita" do Despesas raiz: ponto azul até 80%, âmbar até 90%, vermelho acima. */
function PercentPill({ percent }: { percent: number }) {
  const dot =
    percent <= 80
      ? 'bg-[#0079F2]'
      : percent <= 90
        ? 'bg-[#D97706] dark:bg-[#FBBF24]'
        : 'bg-[#D92D20] dark:bg-[#F97066]';
  return (
    <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap text-gray-800 dark:bg-[#1F1F22] dark:text-white/90">
      <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${dot}`} />
      {formatPct(percent, 0)} da receita
    </span>
  );
}

const ACTIONS_BTN =
  'grid h-11 w-11 shrink-0 place-items-center rounded-xl text-gray-600 active:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0079F2] dark:text-gray-300 dark:active:bg-white/5';

function ActionsButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Ações do grupo ${label}`}
      aria-haspopup="dialog"
      onClick={onClick}
      className={ACTIONS_BTN}
    >
      <DotsIcon />
    </button>
  );
}

export default function MonthGroupBand({
  group,
  expanded,
  onToggle,
  contentId,
  showAnnual,
  onActions,
}: MonthGroupBandProps) {
  const subtotal = formatBRL(group.monthSubtotal);
  const annual =
    showAnnual && group.groupType !== 'saldo' ? `ano ${formatBRL(group.annual)}` : null;

  if (group.level === 1) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-mf-fluxo-band="1"
          data-group-id={group.groupId}
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={onToggle}
          className="grid min-h-12 min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[14px] bg-mf-patrimonio py-1.5 pr-3 pl-2.5 text-left text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0079F2] dark:bg-mf-seguranca dark:text-mf-escolha"
        >
          <Caret expanded={expanded} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">{group.label}</span>
            {group.readOnly ? (
              <span className="flex items-center gap-1 text-[11.5px] font-medium opacity-90">
                <LockIcon />
                automático da Carteira
              </span>
            ) : null}
          </span>
          <span className="flex flex-col items-end text-right text-[15px] font-semibold tabular-nums">
            <span className="whitespace-nowrap">{subtotal}</span>
            {group.percent !== undefined && group.percent !== null ? (
              <PercentPill percent={group.percent} />
            ) : annual ? (
              <small className="text-[11.5px] font-medium whitespace-nowrap opacity-90">
                {annual}
              </small>
            ) : null}
          </span>
        </button>
        {onActions ? <ActionsButton label={group.label} onClick={onActions} /> : null}
      </div>
    );
  }

  if (group.level === 2) {
    return (
      <div className="flex items-center gap-1">
        <CardSectionBand
          id={contentId}
          expanded={expanded}
          onToggle={onToggle}
          className="min-h-12 min-w-0 flex-1"
          label={group.label}
          subtotal={
            <span className="flex flex-col items-end">
              <span>{subtotal}</span>
              {annual ? (
                <small className="text-[11.5px] font-medium opacity-85">{annual}</small>
              ) : null}
            </span>
          }
        />
        {onActions ? <ActionsButton label={group.label} onClick={onActions} /> : null}
      </div>
    );
  }

  // Nível 3: cabeçalho do cartão (o cartão é do MonthGroupSection).
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center ${
        expanded ? 'border-b border-gray-100 dark:border-gray-800' : ''
      }`}
    >
      <button
        type="button"
        data-mf-fluxo-band="3"
        data-group-id={group.groupId}
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={onToggle}
        className="grid min-h-12 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 py-1 pr-1 pl-3 text-left text-gray-800 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0079F2] dark:text-white/90"
      >
        <Caret expanded={expanded} size={16} />
        <span className="truncate text-[12.5px] font-semibold tracking-[0.06em] text-gray-700 uppercase dark:text-gray-300">
          {group.label}
        </span>
        <span className="flex flex-col items-end text-sm font-semibold tabular-nums">
          <span className="whitespace-nowrap">{subtotal}</span>
          {annual ? (
            <small className="text-[11.5px] font-medium whitespace-nowrap text-gray-500 dark:text-gray-400">
              {annual}
            </small>
          ) : null}
        </span>
      </button>
      {onActions ? (
        <ActionsButton label={group.label} onClick={onActions} />
      ) : (
        <span className="w-2" />
      )}
    </div>
  );
}

export { MonthGroupBand };
