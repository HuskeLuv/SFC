'use client';

import { MESES_RELATORIO, type MesesRelatorio } from '@/types/relatorioFinanceiro';

export const ROTULO_PERIODO: Record<MesesRelatorio, string> = {
  1: 'Mês atual',
  3: '3 meses',
  6: '6 meses',
  12: '12 meses',
};

/**
 * Seletor de período da barra do app (fora do .mf-rel, some na impressão): o .seg do protótipo
 * em tons claros do app.
 */
export function SeletorPeriodo({
  valor,
  onChange,
  desabilitado = false,
}: {
  valor: MesesRelatorio;
  onChange: (meses: MesesRelatorio) => void;
  desabilitado?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Período"
      className="inline-flex flex-wrap gap-0.5 rounded-lg bg-gray-100 p-[3px] dark:bg-gray-800"
    >
      {MESES_RELATORIO.map((m) => {
        const ativo = m === valor;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={ativo}
            disabled={desabilitado}
            onClick={() => onChange(m)}
            className={`min-h-11 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mf-outside sm:min-h-9 ${
              ativo
                ? 'bg-mf-outside text-white shadow-theme-xs'
                : 'text-gray-600 hover:bg-white hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
            } disabled:cursor-wait`}
          >
            {ROTULO_PERIODO[m]}
          </button>
        );
      })}
    </div>
  );
}
