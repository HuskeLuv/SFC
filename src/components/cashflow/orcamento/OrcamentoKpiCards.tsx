'use client';

import { formatBRL } from '@/utils/format';
import type { OrcamentoLinha } from './OrcamentoTable';

interface OrcamentoKpiCardsProps {
  totais: { meta: number; real: number; diferenca: number };
  investimentos: OrcamentoLinha | null;
}

/**
 * Cards de resumo da janela exibida: Orçado, Real, Diferença (despesas, sem
 * investimentos) e Investimentos (real vs meta % da renda).
 */
export function OrcamentoKpiCards({ totais, investimentos }: OrcamentoKpiCardsProps) {
  const investDelta =
    investimentos && investimentos.metaJanela !== null
      ? investimentos.real - investimentos.metaJanela
      : null;

  const cards = [
    {
      label: 'Orçado',
      value: formatBRL(totais.meta),
      sub: 'metas das categorias',
      accent: 'text-gray-800 dark:text-gray-100',
    },
    {
      label: 'Real',
      value: formatBRL(totais.real),
      sub: 'despesas na janela',
      accent: 'text-gray-800 dark:text-gray-100',
    },
    {
      label: 'Diferença',
      value: `${totais.diferenca >= 0 ? '+' : '−'}${formatBRL(Math.abs(totais.diferenca))}`,
      sub: totais.diferenca >= 0 ? 'dentro do orçamento' : 'orçamento estourado',
      accent:
        totais.diferenca >= 0
          ? 'text-success-600 dark:text-success-500'
          : 'text-error-600 dark:text-error-500',
    },
    {
      label: 'Investimentos',
      value: investimentos ? formatBRL(investimentos.real) : '—',
      sub:
        investDelta === null
          ? 'defina a meta em % da renda'
          : investDelta >= 0
            ? `+${formatBRL(investDelta)} acima da meta`
            : `${formatBRL(Math.abs(investDelta))} abaixo da meta`,
      accent:
        investDelta === null
          ? 'text-gray-800 dark:text-gray-100'
          : investDelta >= 0
            ? 'text-success-600 dark:text-success-500'
            : 'text-error-600 dark:text-error-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/[0.02]"
        >
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {card.label}
          </p>
          <p className={`mt-1 text-base font-semibold tabular-nums ${card.accent}`}>{card.value}</p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
