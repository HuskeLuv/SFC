'use client';

import MetricCard from '@/components/carteira/shared/MetricCard';
import type { SaudeFinanceiraIndicadores, TendenciasSaude } from '@/hooks/useSaudeFinanceira';
import { formatBRLCompact, formatPercent, tendenciaChange } from './utils';

interface FluxoCardsProps {
  indicadores: SaudeFinanceiraIndicadores;
  tendencias: TendenciasSaude;
  /** Ano do fluxo de caixa usado nas médias (pode ser o anterior). */
  cashflowYear: number;
}

/**
 * Bloco ② — indicadores de fluxo de caixa (médias dos meses ativos do ano),
 * com seta vs o último mês registrado quando há snapshot anterior.
 */
export default function FluxoCards({ indicadores, tendencias, cashflowYear }: FluxoCardsProps) {
  const { fluxo } = indicadores;
  const fonte = `média ${cashflowYear}`;

  const renda = tendenciaChange(tendencias.rendaMensal, true, fonte);
  const gasto = tendenciaChange(tendencias.gastoMensal, false, fonte);
  const poupanca = tendenciaChange(tendencias.poupancaMensal, true, 'renda − gastos');
  const taxa = tendenciaChange(tendencias.taxaPoupanca, true, 'da renda vira patrimônio');

  return (
    <div className="print:break-inside-avoid">
      <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white/90">
        Indicadores Financeiros (Fluxo de Caixa)
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Renda Mensal"
          value={formatBRLCompact(fluxo.rendaMensal)}
          color="primary"
          change={renda.change}
          changeDirection={renda.changeDirection}
        />
        <MetricCard
          title="Gasto Mensal"
          value={formatBRLCompact(fluxo.gastoMensal)}
          color="warning"
          change={gasto.change}
          changeDirection={gasto.changeDirection}
        />
        <MetricCard
          title="Poupança Mensal"
          value={formatBRLCompact(fluxo.poupancaMensal)}
          color={fluxo.poupancaMensal >= 0 ? 'success' : 'error'}
          change={poupanca.change}
          changeDirection={poupanca.changeDirection}
        />
        <MetricCard
          title="Taxa de Poupança"
          value={formatPercent(fluxo.taxaPoupanca)}
          color={fluxo.taxaPoupanca != null && fluxo.taxaPoupanca >= 0.2 ? 'success' : 'warning'}
          change={taxa.change}
          changeDirection={taxa.changeDirection}
        />
      </div>
    </div>
  );
}
