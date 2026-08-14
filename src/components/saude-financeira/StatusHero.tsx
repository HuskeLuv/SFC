'use client';

import type { SaudeFinanceiraIndicadores, TendenciasSaude } from '@/hooks/useSaudeFinanceira';
import { STATUS_META, formatBRL, formatMeses, formatPercent, tendenciaSeta } from './utils';

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
 * Bloco ① — o veredito: status ED/FR/EQ com motivos, ladeado por patrimônio
 * líquido, grau de independência e meses de cobertura (setas vs último mês).
 */
export default function StatusHero({ indicadores, tendencias }: StatusHeroProps) {
  const { status, balanco, metricas } = indicadores;
  const meta = STATUS_META[status.codigo];

  return (
    <div
      className={`print:break-inside-avoid rounded-2xl border bg-white p-5 dark:bg-white/[0.03] ${meta.cardClass}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
            <p className="text-xs text-gray-500 dark:text-gray-400">Patrimônio Líquido</p>
            <p
              className={`text-lg font-semibold ${
                balanco.patrimonioLiquido < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-900 dark:text-white/90'
              }`}
            >
              {formatBRL(balanco.patrimonioLiquido)}
              <Seta seta={tendenciaSeta(tendencias.patrimonioLiquido, true)} />
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Independência financeira</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white/90">
              {formatPercent(metricas.grauIndependencia)}
              <Seta seta={tendenciaSeta(tendencias.grauIndependencia, true)} />
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">do patrimônio necessário</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Cobertura de gastos</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white/90">
              {formatMeses(metricas.mesesCobertura)}
              <Seta seta={tendenciaSeta(tendencias.mesesCobertura, true)} />
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">em ativos líquidos</p>
          </div>
        </div>
      </div>
    </div>
  );
}
