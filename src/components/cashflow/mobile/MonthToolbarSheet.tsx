'use client';

import React from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';

/**
 * "Mais ações" da visão do mês (PWA fase 2): as ações da CashflowToolbar do desktop (que não monta
 * no celular) mais o "Ver ano inteiro" e o switch do total do ano embaixo de cada linha.
 */

export interface MonthToolbarSheetProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
  onOpenYear: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  showAnnual: boolean;
  onToggleAnnual: () => void;
  onImport: () => void;
}

const ROW =
  'flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left text-gray-800 active:bg-gray-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0079F2] dark:text-white/90 dark:active:bg-white/5';
const ICON =
  'grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-mf-tranquilidade/15 text-mf-seguranca dark:bg-mf-tranquilidade/15 dark:text-mf-tranquilidade';

const Svg = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d={d}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function Action({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: string;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={ROW}>
      <span className={ICON}>
        <Svg d={icon} />
      </span>
      <span className="flex min-w-0 flex-col">
        <b className="text-[15px] font-semibold">{label}</b>
        {hint ? <small className="text-xs text-gray-500 dark:text-gray-400">{hint}</small> : null}
      </span>
    </button>
  );
}

export default function MonthToolbarSheet({
  isOpen,
  onClose,
  year,
  onOpenYear,
  onExpandAll,
  onCollapseAll,
  showAnnual,
  onToggleAnnual,
  onImport,
}: MonthToolbarSheetProps) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Mais ações">
      <p className="-mt-1 mb-2 text-sm text-gray-500 dark:text-gray-400">Fluxo de Caixa · {year}</p>
      <div className="flex flex-col pb-2">
        <Action
          icon="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"
          label="Ver ano inteiro"
          hint="Grade com os 12 meses"
          onClick={onOpenYear}
        />
        <Action icon="M7 10l5 5 5-5M7 4l5 5 5-5" label="Expandir tudo" onClick={onExpandAll} />
        <Action icon="M7 14l5-5 5 5M7 20l5-5 5 5" label="Recolher tudo" onClick={onCollapseAll} />
        <button
          type="button"
          role="switch"
          aria-checked={showAnnual}
          onClick={onToggleAnnual}
          className={`${ROW} justify-between`}
        >
          <span className="flex min-w-0 flex-col">
            <b className="text-[15px] font-semibold">Mostrar total do ano</b>
            <small className="text-xs text-gray-500 dark:text-gray-400">
              Embaixo do valor de cada linha
            </small>
          </span>
          <span
            aria-hidden="true"
            className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${
              showAnnual ? 'bg-mf-patrimonio' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow motion-safe:transition-transform ${
                showAnnual ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
        <Action
          icon="M12 16V4m0 0L7 9m5-5l5 5M5 20h14"
          label="Importar planilha"
          hint="Arquivo FLC .xlsx"
          onClick={onImport}
        />
      </div>
    </BottomSheet>
  );
}

export { MonthToolbarSheet };
