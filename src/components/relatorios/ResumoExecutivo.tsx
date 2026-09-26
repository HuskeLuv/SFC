'use client';

import { MYFINANCE_BRAND } from '@/constants/brandColors';
import { MobileMetricGrid } from '@/components/ui/mobile/MobileMetricGrid';
import { useIsBelowLg } from '@/hooks/useMediaQuery';

/**
 * Resumo Executivo do relatório (ticket 20/08/2026, formato Gorila/Kinvo):
 * os números-chave do período em cards, antes dos gráficos. Componente
 * presentacional — todos os valores chegam prontos da página.
 */

const brl = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const pct = (v: number): string =>
  `${v >= 0 ? '+' : ''}${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export interface ResumoExecutivoProps {
  patrimonioFim: number;
  /** Resultado financeiro do período: Δ patrimônio − aportes líquidos. */
  resultadoPeriodo: number | null;
  /** TWR acumulado do período (%). */
  rentabilidadePeriodo: number | null;
  /** CDI acumulado do mesmo período (%). */
  cdiPeriodo: number | null;
  proventosPeriodo: number;
  /** Compras − vendas do período (sem operações "dinheiro já estava investido"). */
  aportesLiquidosPeriodo: number | null;
}

export default function ResumoExecutivo({
  patrimonioFim,
  resultadoPeriodo,
  rentabilidadePeriodo,
  cdiPeriodo,
  proventosPeriodo,
  aportesLiquidosPeriodo,
}: ResumoExecutivoProps) {
  const cards: Array<{ label: string; value: string; accent?: string; sub?: string }> = [
    { label: 'Patrimônio no fim do período', value: brl(patrimonioFim) },
    {
      label: 'Resultado financeiro no período',
      value: resultadoPeriodo === null ? '—' : brl(resultadoPeriodo),
      accent: resultadoPeriodo === null ? undefined : resultadoPeriodo >= 0 ? '#12B76A' : '#F04438',
      sub: 'Variação do patrimônio descontados aportes e resgates',
    },
    {
      label: 'Rentabilidade no período (TWR)',
      value: rentabilidadePeriodo === null ? '—' : pct(rentabilidadePeriodo),
      accent: MYFINANCE_BRAND.outside,
      sub: cdiPeriodo === null ? undefined : `CDI no período: ${pct(cdiPeriodo)}`,
    },
    { label: 'Proventos recebidos', value: brl(proventosPeriodo) },
    {
      label: 'Aportes líquidos',
      value: aportesLiquidosPeriodo === null ? '—' : brl(aportesLiquidosPeriodo),
      sub: 'Compras − vendas do período',
    },
  ];

  const isBelowLg = useIsBelowLg();

  // Celular (PWA fase 3): 2×2 com o patrimônio em destaque na 1ª linha inteira. Sem verde e sem
  // texto em #0079F2: resultado positivo no azul da paleta, negativo no vermelho.
  const resultadoClasse =
    resultadoPeriodo === null
      ? undefined
      : resultadoPeriodo >= 0
        ? 'text-mf-patrimonio dark:text-mf-tranquilidade'
        : 'text-[#D92D20] dark:text-[#F97066]';
  const mobile = isBelowLg ? (
    <div className="hidden mscreen:block">
      <MobileMetricGrid
        className="[&>div:first-child]:col-span-2 [&>div:first-child_dd]:text-xl"
        items={[
          { label: cards[0].label, value: cards[0].value },
          {
            label: 'Rentabilidade (TWR)',
            value: cards[2].value,
            hint: cards[2].sub,
          },
          {
            label: 'Resultado financeiro',
            value: <span className={resultadoClasse}>{cards[1].value}</span>,
            hint: 'descontados aportes e resgates',
          },
          { label: 'Aportes líquidos', value: cards[4].value, hint: cards[4].sub },
          { label: cards[3].label, value: cards[3].value },
        ]}
      />
    </div>
  ) : null;

  return (
    <>
      {mobile}
      <div
        className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5${
          isBelowLg ? ' mscreen:hidden' : ''
        }`}
      >
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
            <p
              className="mt-1 text-lg font-semibold text-gray-900 dark:text-white"
              style={card.accent ? { color: card.accent } : undefined}
            >
              {card.value}
            </p>
            {card.sub && <p className="mt-1 text-[11px] text-gray-400">{card.sub}</p>}
          </div>
        ))}
      </div>
    </>
  );
}
