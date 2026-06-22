'use client';

import { useState } from 'react';
import type { PlanejamentoContexto } from '@/hooks/usePlanejamentoContexto';
import { formatBRLCompact } from './utils';

interface ReservaEmergenciaWidgetProps {
  contexto: PlanejamentoContexto | null;
}

const MESES_OPTIONS = [3, 6, 12] as const;

/**
 * Reserva de emergência: ideal vs. atual. Cruza a despesa fixa mensal (do fluxo
 * de caixa) com a reserva já existente (da carteira) — ambos vêm do contexto de
 * planejamento, sem nada digitado pelo usuário. O alvo em meses é configurável.
 */
export default function ReservaEmergenciaWidget({ contexto }: ReservaEmergenciaWidgetProps) {
  const [mesesAlvo, setMesesAlvo] = useState<number>(6);

  if (!contexto) return null;

  const despesaFixa = contexto.cashflow.despesaFixaMensal;
  const atual = contexto.reservaEmergenciaAtual;

  if (despesaFixa <= 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white/90">
          Reserva de Emergência
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Preencha suas <strong>despesas fixas</strong> no fluxo de caixa para calcularmos sua
          reserva ideal automaticamente.
        </p>
      </div>
    );
  }

  const ideal = despesaFixa * mesesAlvo;
  const mesesCobertos = atual / despesaFixa;
  const pct = ideal > 0 ? Math.min(100, (atual / ideal) * 100) : 0;
  const gap = ideal - atual;
  const completa = gap <= 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white/90">
          Reserva de Emergência
        </h3>
        <div className="inline-flex rounded-md border border-gray-200 dark:border-gray-700">
          {MESES_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMesesAlvo(m)}
              className={`px-2 py-0.5 text-[11px] font-medium transition ${
                m === mesesAlvo
                  ? 'bg-brand-500 text-white'
                  : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}
            >
              {m}m
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2 flex items-end justify-between">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Atual</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white/90">
            {formatBRLCompact(atual)}
          </p>
          <p className="text-[11px] text-gray-400">
            ≈ {mesesCobertos.toFixed(1)} {mesesCobertos === 1 ? 'mês' : 'meses'} de despesa fixa
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 dark:text-gray-400">Ideal ({mesesAlvo}m)</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white/90">
            {formatBRLCompact(ideal)}
          </p>
        </div>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div
          className={`h-full rounded-full ${completa ? 'bg-green-500' : 'bg-brand-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-2 text-xs">
        {completa ? (
          <span className="text-green-600 dark:text-green-400">
            ✓ Reserva completa para {mesesAlvo} meses.
          </span>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">
            Faltam{' '}
            <strong className="text-gray-700 dark:text-gray-200">{formatBRLCompact(gap)}</strong>{' '}
            para cobrir {mesesAlvo} meses de despesa fixa.
          </span>
        )}
      </p>
    </div>
  );
}
