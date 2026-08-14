'use client';

import type { SaudeFinanceiraIndicadores, TendenciasSaude } from '@/hooks/useSaudeFinanceira';
import { STATUS_META, formatMeses, formatPercent, tendenciaSeta } from './utils';

interface StatusHeroProps {
  indicadores: SaudeFinanceiraIndicadores;
  tendencias: TendenciasSaude;
}

function Seta({ seta }: { seta: ReturnType<typeof tendenciaSeta> }) {
  if (!seta) return null;
  return (
    <span className={`ml-1 text-sm font-semibold ${seta.className}`} title="vs mês anterior">
      {seta.glyph}
    </span>
  );
}

/**
 * Bloco "Status Saúde Financeira" da planilha: o veredito ED/FR/EQ com
 * motivos, ladeado pelas três métricas que sustentam a classificação —
 * meses de cobertura, endividamento de curto prazo e passivo/ativo total.
 */
export default function StatusHero({ indicadores, tendencias }: StatusHeroProps) {
  const { status, metricas } = indicadores;
  const meta = STATUS_META[status.codigo];

  return (
    <div
      className={`print:break-inside-avoid rounded-2xl border bg-white p-5 dark:bg-white/[0.03] ${meta.cardClass}`}
    >
      <h3 className="text-base font-semibold text-gray-900 dark:text-white/90">
        Status Saúde Financeira
      </h3>
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <span
            className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${meta.badgeClass}`}
          >
            {meta.label}
          </span>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{meta.descricao}</p>
          {status.motivos.length > 0 ? (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
              {status.motivos.map((motivo) => (
                <li key={motivo}>{motivo}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Meses de cobertura</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white/90">
              {formatMeses(metricas.mesesCobertura)}
              <Seta seta={tendenciaSeta(tendencias.mesesCobertura, true)} />
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              de gastos em ativos líquidos
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Endividamento curto prazo</p>
            <p
              className={`text-lg font-semibold ${
                metricas.endividamentoCurtoPrazo != null && metricas.endividamentoCurtoPrazo > 1
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-900 dark:text-white/90'
              }`}
            >
              {formatPercent(metricas.endividamentoCurtoPrazo)}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              dívidas CP / ativos líquidos
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Passivo / ativo total</p>
            <p
              className={`text-lg font-semibold ${
                metricas.passivoSobreAtivo != null && metricas.passivoSobreAtivo > 0.5
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-900 dark:text-white/90'
              }`}
            >
              {formatPercent(metricas.passivoSobreAtivo)}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              acima de 50% caracteriza endividamento
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
