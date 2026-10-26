'use client';

import type { ReactNode } from 'react';
import Tooltip from '@/components/ui/tooltip/Tooltip';
import { MONTHS } from '@/constants/cashflow';
import type { FonteOrcamento, VisaoOrcamento } from '@/types/orcamentoV2';
import { TEXTO_FONTE_P1 } from './apresentacao';

interface OrcamentoV2MolduraProps {
  ano: number;
  /** 1–12. */
  mes: number;
  onMesChange: (mes: number) => void;
  visao: VisaoOrcamento;
  onVisaoChange: (visao: VisaoOrcamento) => void;
  fonte: FonteOrcamento;
  onFonteChange: (fonte: FonteOrcamento) => void;
  /** Texto de referência à direita ("Realizado até 23/10 · 8 dias para fechar o mês"). */
  referencia: string;
  /** Ações à direita (botão "Copiar de <mês>"). */
  acoes?: ReactNode;
  children: ReactNode;
}

/**
 * Moldura do Orçamento v2 = a casca da aba de orçamento de hoje (`OrcamentoVsRealSection`, D10):
 * as mesmas pills Mês | Acumulado do ano, o mesmo seletor de mês e as mesmas pills Lançado |
 * Consolidado, nas mesmas classes. Ganha o "?" com o texto da P1 (T30 revisto), o texto de
 * referência do realizado e o lugar do "Copiar de <mês>". O mês segue visível no acumulado
 * (que é jan..mês selecionado, R-15).
 */
export default function OrcamentoV2Moldura({
  ano,
  mes,
  onMesChange,
  visao,
  onVisaoChange,
  fonte,
  onFonteChange,
  referencia,
  acoes,
  children,
}: OrcamentoV2MolduraProps) {
  const toggleClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
      active
        ? 'bg-white text-brand-600 shadow-theme-xs dark:bg-gray-900 dark:text-brand-400'
        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
    }`;

  return (
    <div className="space-y-5">
      {/* Controles: visão, mês e fonte do realizado */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-white/[0.03]">
          <button
            type="button"
            className={toggleClass(visao === 'mes')}
            onClick={() => onVisaoChange('mes')}
            aria-pressed={visao === 'mes'}
          >
            Mês
          </button>
          <button
            type="button"
            className={toggleClass(visao === 'ano')}
            onClick={() => onVisaoChange('ano')}
            aria-pressed={visao === 'ano'}
          >
            Acumulado do ano
          </button>
        </div>

        <select
          value={mes}
          onChange={(e) => onMesChange(Number(e.target.value))}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
          aria-label="Mês"
        >
          {MONTHS.map((label, index) => (
            <option key={label} value={index + 1}>
              {label}/{String(ano).slice(-2)}
            </option>
          ))}
        </select>

        <div className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-white/[0.03]">
          <button
            type="button"
            className={toggleClass(fonte === 'lancado')}
            onClick={() => onFonteChange('lancado')}
            aria-pressed={fonte === 'lancado'}
          >
            Lançado
          </button>
          <button
            type="button"
            className={toggleClass(fonte === 'consolidado')}
            onClick={() => onFonteChange('consolidado')}
            aria-pressed={fonte === 'consolidado'}
          >
            Consolidado
          </button>
          <Tooltip content={TEXTO_FONTE_P1} placement="bottom">
            <button
              type="button"
              aria-label={`Ajuda: ${TEXTO_FONTE_P1}`}
              className="mx-1 flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-[11px] font-semibold text-gray-500 hover:border-gray-400 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0079F2] dark:border-gray-600 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ?
            </button>
          </Tooltip>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400" data-mf-orcamento-referencia="">
          {referencia}
        </p>
        {acoes && <div className="ml-auto flex items-center gap-2">{acoes}</div>}
      </div>

      {children}
    </div>
  );
}
