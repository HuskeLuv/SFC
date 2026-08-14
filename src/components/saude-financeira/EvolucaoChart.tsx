'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { useSaudeFinanceiraEvolucao } from '@/hooks/useSaudeFinanceira';
import { formatBRL, MONTH_NAMES_PT } from './utils';
import EvolucaoTabela from './EvolucaoTabela';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

const COLOR_PL = '#465FFF';
const COLOR_LIQUIDEZ = '#12B76A';
const COLOR_DIVIDA = '#F04438';

/**
 * Bloco ⑤ — evolução mensal dos indicadores a partir dos snapshots. A série
 * nasce no primeiro acesso (upsert lazy) e ganha um ponto por mês visitado;
 * com menos de 2 pontos mostra o estado de "acompanhamento iniciado".
 */
export default function EvolucaoChart() {
  const { snapshots, loading, error } = useSaudeFinanceiraEvolucao();

  const chart = useMemo(() => {
    const categories = snapshots.map(
      (s) => `${MONTH_NAMES_PT[s.month] ?? s.month + 1}/${String(s.year).slice(-2)}`,
    );
    const series = [
      {
        name: 'Patrimônio Líquido',
        data: snapshots.map((s) => Math.round(s.data.patrimonioLiquido)),
      },
      {
        name: 'Ativos de alta liquidez',
        data: snapshots.map((s) => Math.round(s.data.ativosAltaLiquidez)),
      },
      {
        name: 'Endividamento total',
        data: snapshots.map((s) =>
          Math.round(s.data.passivosCurtoPrazo + s.data.passivosLongoPrazo),
        ),
      },
    ];
    const options: ApexOptions = {
      chart: { type: 'line', toolbar: { show: false }, fontFamily: 'inherit' },
      colors: [COLOR_PL, COLOR_LIQUIDEZ, COLOR_DIVIDA],
      stroke: { curve: 'smooth', width: [3, 2, 2] },
      markers: { size: 4 },
      xaxis: { categories, labels: { style: { colors: '#98A2B3' } } },
      yaxis: {
        labels: {
          style: { colors: '#98A2B3' },
          formatter: (v: number) => `R$ ${Math.round(v / 1000)}k`,
        },
      },
      grid: { borderColor: 'rgba(152,162,179,0.15)' },
      legend: { labels: { colors: '#98A2B3' } },
      tooltip: { y: { formatter: (v: number) => formatBRL(v) } },
      dataLabels: { enabled: false },
    };
    return { series, options };
  }, [snapshots]);

  return (
    <div className="print:break-inside-avoid rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white/90">Evolução</h3>
      {loading ? (
        <p className="mt-3 text-sm text-gray-400 dark:text-gray-500">Carregando evolução...</p>
      ) : error ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : snapshots.length < 2 ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          O acompanhamento mensal começou agora: uma foto dos seus indicadores é registrada a cada
          mês em que você visita esta página. A partir do próximo mês o gráfico compara a evolução
          do patrimônio líquido, da liquidez e do endividamento.
        </p>
      ) : (
        <>
          <div className="mt-2">
            <ReactApexChart
              type="line"
              height={320}
              series={chart.series}
              options={chart.options}
            />
          </div>
          <EvolucaoTabela snapshots={snapshots} />
        </>
      )}
    </div>
  );
}
