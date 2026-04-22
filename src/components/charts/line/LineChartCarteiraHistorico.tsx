'use client';
import React, { useEffect, useState, useMemo } from 'react';
import { ApexOptions } from 'apexcharts';

const hasFunctionValue = (value: unknown): boolean => {
  if (typeof value === 'function') {
    return true;
  }

  if (!value) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasFunctionValue(item));
  }

  if (typeof value !== 'object') {
    return false;
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (hasFunctionValue((value as Record<string, unknown>)[key])) {
      return true;
    }
  }

  return false;
};

// Componente wrapper para o ReactApexChart
const ApexChartWrapper = React.memo(
  ({
    options,
    series,
    type,
    height,
  }: {
    options: ApexOptions;
    series: Array<{ name: string; data: number[][] }>;
    type: string;
    height: number;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [Chart, setChart] = useState<React.ComponentType<any> | null>(null);

    // IMPORTANTE: useMemo deve ser chamado antes de qualquer early return para manter ordem dos hooks
    // Sanitizar options para evitar enumeração de searchParams pelo ApexCharts
    const sanitizedOptions = useMemo(() => {
      if (hasFunctionValue(options)) {
        return options;
      }

      try {
        return JSON.parse(JSON.stringify(options)) as ApexOptions;
      } catch {
        return options;
      }
    }, [options]);

    useEffect(() => {
      // Importação dinâmica do ReactApexChart apenas no client-side
      const loadChart = async () => {
        try {
          const ReactApexChart = (await import('react-apexcharts')).default;
          setChart(() => ReactApexChart);
        } catch (error) {
          console.error('Erro ao carregar ApexCharts:', error);
        }
      };

      loadChart();
    }, []);

    if (!Chart) {
      return (
        <div className="flex items-center justify-center h-80">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
        </div>
      );
    }

    return <Chart options={sanitizedOptions} series={series} type={type} height={height} />;
  },
);

ApexChartWrapper.displayName = 'ApexChartWrapper';

interface LineChartCarteiraHistoricoProps {
  data: Array<{
    data: number;
    valorAplicado: number;
    saldoBruto: number;
  }>;
}

type PeriodoId = '1M' | '3M' | '6M' | 'YTD' | '1A' | 'MAX';

const PERIODOS: Array<{ id: PeriodoId; label: string }> = [
  { id: '1M', label: '1M' },
  { id: '3M', label: '3M' },
  { id: '6M', label: '6M' },
  { id: 'YTD', label: 'YTD' },
  { id: '1A', label: '1A' },
  { id: 'MAX', label: 'Máx' },
];

/** Timestamp inicial (ms) para o período; null significa "sem limite" (Máx). */
const periodoStart = (id: PeriodoId, latestTs: number): number | null => {
  const d = new Date(latestTs);
  switch (id) {
    case '1M':
      d.setMonth(d.getMonth() - 1);
      return d.getTime();
    case '3M':
      d.setMonth(d.getMonth() - 3);
      return d.getTime();
    case '6M':
      d.setMonth(d.getMonth() - 6);
      return d.getTime();
    case 'YTD':
      return new Date(d.getFullYear(), 0, 1).getTime();
    case '1A':
      d.setFullYear(d.getFullYear() - 1);
      return d.getTime();
    case 'MAX':
      return null;
  }
};

export default function LineChartCarteiraHistorico({
  data: historicoData,
}: LineChartCarteiraHistoricoProps) {
  const [periodo, setPeriodo] = useState<PeriodoId>('MAX');

  const filteredData = useMemo(() => {
    if (historicoData.length === 0) return historicoData;
    const latestTs = historicoData[historicoData.length - 1].data;
    const startTs = periodoStart(periodo, latestTs);
    if (startTs == null) return historicoData;
    const cut = historicoData.filter((item) => item.data >= startTs);
    // Se o período corta toda a série (poucos pontos), preserva ao menos os 2 últimos
    // para o gráfico não ficar vazio
    return cut.length >= 2 ? cut : historicoData.slice(-2);
  }, [historicoData, periodo]);

  const appliedSeries = useMemo(
    () => filteredData.map((item) => [item.data, item.valorAplicado]),
    [filteredData],
  );
  const grossSeries = useMemo(
    () => filteredData.map((item) => [item.data, item.saldoBruto]),
    [filteredData],
  );

  // Ajusta o eixo Y para uma janela apertada em torno dos dados. Sem isso o ApexCharts
  // força min=0 no gráfico de área, e ativos cujo valor parte alto (ex.: CDB de R$ 10k
  // rendendo 0,5%/mês) ficam colados no topo com a maior parte do gráfico vazia.
  const yAxisMin = useMemo(() => {
    if (filteredData.length === 0) return undefined;
    const values = filteredData
      .flatMap((item) => [item.valorAplicado, item.saldoBruto])
      .filter((v) => Number.isFinite(v));
    if (values.length === 0) return undefined;
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue;
    // Se todos os valores são iguais (ou quase), abre uma janela mínima de 5% em volta.
    const padding = range > 0 ? range * 0.1 : Math.max(minValue * 0.05, 1);
    const candidate = minValue - padding;
    // Evita min negativo quando todos os valores são positivos
    return minValue >= 0 ? Math.max(0, candidate) : candidate;
  }, [filteredData]);

  const isShortPeriod = periodo === '1M' || periodo === '3M' || periodo === '6M';

  const options: ApexOptions = useMemo(
    () => ({
      legend: {
        show: true,
        position: 'top',
        horizontalAlign: 'left',
      },
      colors: ['#10B981', '#465FFF'],
      chart: {
        fontFamily: 'Outfit, sans-serif',
        height: 335,
        id: 'patrimonio-historico',
        type: 'area',
        toolbar: {
          show: false,
        },
      },
      stroke: {
        curve: 'smooth',
        width: [2],
      },
      dataLabels: {
        enabled: false,
      },
      markers: {
        size: 0,
        hover: {
          size: 4,
        },
      },
      xaxis: {
        type: 'datetime',
        tickAmount: 6,
        axisBorder: {
          show: false,
        },
        axisTicks: {
          show: false,
        },
        tooltip: {
          enabled: false,
        },
        labels: {
          style: {
            colors: '#64748B',
            fontSize: '12px',
          },
          formatter: (val: string) => {
            const date = new Date(val);
            const months = [
              'Jan',
              'Fev',
              'Mar',
              'Abr',
              'Mai',
              'Jun',
              'Jul',
              'Ago',
              'Set',
              'Out',
              'Nov',
              'Dez',
            ];
            if (isShortPeriod) {
              return `${String(date.getDate()).padStart(2, '0')} ${months[date.getMonth()]}`;
            }
            return `${months[date.getMonth()]} ${date.getFullYear()}`;
          },
        },
      },
      yaxis: {
        min: yAxisMin,
        forceNiceScale: true,
        title: {
          text: '',
          style: {
            fontSize: '0px',
          },
        },
        labels: {
          style: {
            colors: '#64748B',
            fontSize: '12px',
          },
          formatter: (val: number) => {
            return `R$ ${(val / 1000).toFixed(0)}K`;
          },
        },
      },
      tooltip: {
        shared: true,
        intersect: false,
        inverseOrder: true,
        x: {
          format: 'MMM yyyy',
          formatter: (val: number) => {
            const date = new Date(val);
            const months = [
              'Janeiro',
              'Fevereiro',
              'Março',
              'Abril',
              'Maio',
              'Junho',
              'Julho',
              'Agosto',
              'Setembro',
              'Outubro',
              'Novembro',
              'Dezembro',
            ];
            return `${months[date.getMonth()]} ${date.getFullYear()}`;
          },
        },
        y: {
          formatter: (val: number) => {
            return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          },
        },
      },
      fill: {
        type: 'gradient',
        gradient: {
          opacityFrom: 0.55,
          opacityTo: 0,
          gradientToColors: ['#465FFF'],
        },
      },
      grid: {
        xaxis: {
          lines: {
            show: false,
          },
        },
        yaxis: {
          lines: {
            show: true,
          },
        },
        borderColor: '#E5E7EB',
      },
    }),
    [isShortPeriod, yAxisMin],
  );

  const series = useMemo(
    () => [
      {
        name: 'Valor Aplicado',
        data: appliedSeries,
      },
      {
        name: 'Valor Atual',
        data: grossSeries,
      },
    ],
    [appliedSeries, grossSeries],
  );

  return (
    <div className="max-w-full overflow-x-auto custom-scrollbar">
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {PERIODOS.map((p) => {
          const isActive = p.id === periodo;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriodo(p.id)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
              aria-pressed={isActive}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div id="chartPatrimonio" className="min-w-[600px] xl:min-w-full">
        <ApexChartWrapper options={options} series={series} type="area" height={335} />
      </div>
    </div>
  );
}
