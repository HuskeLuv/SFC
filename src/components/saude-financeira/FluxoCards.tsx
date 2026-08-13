'use client';

import MetricCard from '@/components/carteira/shared/MetricCard';
import type { SaudeFinanceiraIndicadores } from '@/hooks/useSaudeFinanceira';
import { formatBRLCompact, formatPercent } from './utils';

interface FluxoCardsProps {
  indicadores: SaudeFinanceiraIndicadores;
  /** Ano do fluxo de caixa usado nas médias (pode ser o anterior). */
  cashflowYear: number;
}

/**
 * Bloco ② — indicadores de fluxo de caixa (médias dos meses ativos do ano).
 */
export default function FluxoCards({ indicadores, cashflowYear }: FluxoCardsProps) {
  const { fluxo } = indicadores;
  const fonte = `média ${cashflowYear}`;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        title="Renda Mensal"
        value={formatBRLCompact(fluxo.rendaMensal)}
        color="primary"
        change={fonte}
        changeDirection="neutral"
      />
      <MetricCard
        title="Gasto Mensal"
        value={formatBRLCompact(fluxo.gastoMensal)}
        color="warning"
        change={fonte}
        changeDirection="neutral"
      />
      <MetricCard
        title="Poupança Mensal"
        value={formatBRLCompact(fluxo.poupancaMensal)}
        color={fluxo.poupancaMensal >= 0 ? 'success' : 'error'}
        change="renda − gastos"
        changeDirection="neutral"
      />
      <MetricCard
        title="Taxa de Poupança"
        value={formatPercent(fluxo.taxaPoupanca)}
        color={fluxo.taxaPoupanca != null && fluxo.taxaPoupanca >= 0.2 ? 'success' : 'warning'}
        change="da renda vira patrimônio"
        changeDirection="neutral"
      />
    </div>
  );
}
