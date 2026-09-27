'use client';

import MetricCard from '@/components/carteira/shared/MetricCard';
import type { SaudeFinanceiraIndicadores, TendenciasSaude } from '@/hooks/useSaudeFinanceira';
import { MobileMetricGrid } from '@/components/ui/mobile/MobileMetricGrid';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
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
  const isBelowLg = useIsBelowLg();

  return (
    <div className="print:break-inside-avoid">
      <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white/90">
        Indicadores Financeiros (Fluxo de Caixa)
      </h3>
      {isBelowLg ? (
        <div className="hidden mscreen:block">
          <MobileMetricGrid
            items={[
              {
                label: 'Renda Mensal',
                value: formatBRLCompact(fluxo.rendaMensal),
                hint: renda.change,
              },
              {
                label: 'Gasto Mensal',
                value: formatBRLCompact(fluxo.gastoMensal),
                hint: gasto.change,
              },
              {
                label: 'Poupança Mensal',
                value: (
                  <span
                    className={
                      fluxo.poupancaMensal < 0 ? 'text-[#D92D20] dark:text-[#F97066]' : undefined
                    }
                  >
                    {formatBRLCompact(fluxo.poupancaMensal)}
                  </span>
                ),
                hint: poupanca.change,
              },
              {
                label: 'Taxa de Poupança',
                value: formatPercent(fluxo.taxaPoupanca),
                hint: taxa.change,
              },
            ]}
          />
        </div>
      ) : null}
      <div
        className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4${
          isBelowLg ? ' mscreen:hidden' : ''
        }`}
      >
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
