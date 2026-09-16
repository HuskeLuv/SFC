'use client';
import React from 'react';

interface CashflowToolbarProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  /** Rola a grade uma "página" de meses (−1 anteriores, +1 próximos). */
  onScrollMonths: (direction: -1 | 1) => void;
  onImport: () => void;
}

const SECONDARY =
  'inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700';
const ICON =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700';

/**
 * Barra de ferramentas da planilha: recolher/expandir tudo, setas para rolar
 * os meses (a barra de rolagem fica no fim de ~200 linhas) e importar.
 * O ano continua no menu lateral (decisão da reunião de jun/2026).
 */
export const CashflowToolbar: React.FC<CashflowToolbarProps> = ({
  onExpandAll,
  onCollapseAll,
  onScrollMonths,
  onImport,
}) => (
  <div className="mb-3 flex flex-shrink-0 flex-wrap items-center justify-between gap-2">
    <div className="flex items-center gap-2">
      <button type="button" onClick={onExpandAll} className={SECONDARY}>
        Expandir tudo
      </button>
      <button type="button" onClick={onCollapseAll} className={SECONDARY}>
        Recolher tudo
      </button>
    </div>
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onScrollMonths(-1)}
        className={ICON}
        aria-label="Meses anteriores"
        title="Meses anteriores"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M10 3L5 8L10 13"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onScrollMonths(1)}
        className={ICON}
        aria-label="Próximos meses"
        title="Próximos meses"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M6 3L11 8L6 13"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={onImport}
        className="inline-flex items-center rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-600"
      >
        Importar planilha
      </button>
    </div>
  </div>
);
