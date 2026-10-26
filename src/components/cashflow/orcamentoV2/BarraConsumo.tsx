'use client';

import type { StatusOrcamento } from '@/lib/orcamento/regras';
import { SELO_TEXTO, TOM_FUNDO } from '@/lib/orcamento/tons';
import { formatNumber } from '@/utils/format';
import { TOM_DO_STATUS } from './apresentacao';

interface BarraConsumoProps {
  /** Fração (0,9083) do payload; `null` = sem orçado ("—"). */
  consumido: number | null;
  status: StatusOrcamento;
  /** Ritmo do mês/ano (0–1) do payload: posição do traço. */
  ritmo: number;
  /** Texto do traço ("ritmo do mês: dia 23 de 31"). */
  tituloRitmo: string;
}

/**
 * Coluna "Consumido" (spec §4.5): barra de 120 px com o traço do ritmo e o % (0 casas). A cor é a
 * do status que o servidor mandou (tons de `lib/orcamento/tons`); o texto só ganha cor quando o
 * status pede ação (à frente do ritmo / estouro).
 */
export default function BarraConsumo({ consumido, status, ritmo, tituloRitmo }: BarraConsumoProps) {
  if (consumido === null) {
    return (
      <span className="inline-flex items-center gap-2" data-mf-consumo="none">
        <span
          className="block h-2 w-[120px] rounded-full bg-gray-100 dark:bg-gray-800"
          title="sem orçamento"
        />
        <span className="w-11 text-right text-xs tabular-nums text-gray-400 dark:text-gray-500">
          —
        </span>
      </span>
    );
  }
  const tom = TOM_DO_STATUS[status];
  const destaque = status === 'warn' || status === 'bad';
  const pct = consumido * 100;
  return (
    <span className="inline-flex items-center gap-2" data-mf-consumo={status}>
      <span className="relative block h-2 w-[120px] rounded-full bg-gray-100 dark:bg-gray-800">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${TOM_FUNDO[tom]}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
        <span
          aria-hidden
          title={tituloRitmo}
          className="absolute -top-0.5 h-3 w-0.5 rounded bg-gray-700 dark:bg-gray-200"
          style={{ left: `${(Math.min(1, Math.max(0, ritmo)) * 100).toFixed(1)}%` }}
        />
      </span>
      <span
        className={`w-11 text-right text-xs font-semibold tabular-nums ${
          destaque ? SELO_TEXTO[tom] : 'text-gray-600 dark:text-gray-300'
        }`}
      >
        {formatNumber(pct, 0)}%
      </span>
    </span>
  );
}
