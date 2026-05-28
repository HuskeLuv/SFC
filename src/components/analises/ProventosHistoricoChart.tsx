'use client';

import { logger } from '@/lib/logger';
import React, { useEffect, useState, useMemo } from 'react';
import { ApexOptions } from 'apexcharts';
import { ProventoData } from '@/hooks/useProventos';

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
      const loadChart = async () => {
        try {
          const ReactApexChart = (await import('react-apexcharts')).default;
          setChart(() => ReactApexChart);
        } catch (error) {
          logger.error('Erro ao carregar ApexCharts:', error);
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

interface ProventosHistoricoChartProps {
  proventos: ProventoData[];
}

const COLORS = [
  '#4F46E5',
  '#9333EA',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#84CC16',
  '#06B6D4',
  '#F97316',
  '#8B5CF6',
];

// Bug F1.2: o eixo X do gráfico renderizava "Jan 1970" sequencialmente quando
// qualquer provento chegava com `data` inválida — `null`, `0`, `''`, ou um
// timestamp epoch-zero persistido no banco vindo de payloads BRAPI com
// `paymentDate: 0`. O check anterior (`Number.isNaN(date.getTime())`) só
// pega Invalid Date; `new Date(0)` e `new Date(null)` retornam epoch (1970)
// e passavam direto, virando barras com label "Jan 1970" no ApexCharts.
//
// Threshold conservador: anything before 1990-01-01 é claramente lixo
// (mercado financeiro brasileiro pré-Real, BRAPI não cobre essa janela).
const MIN_VALID_PROVENTO_MS = Date.UTC(1990, 0, 1);

const isValidProventoDate = (date: Date): boolean => {
  const time = date.getTime();
  return Number.isFinite(time) && time >= MIN_VALID_PROVENTO_MS;
};

export default function ProventosHistoricoChart({ proventos }: ProventosHistoricoChartProps) {
  const { series, colors, xMin, xMax } = useMemo(() => {
    const monthlyMap = new Map<string, Map<string, number>>();
    const ativosSet = new Set<string>();

    proventos.forEach((provento) => {
      if (!provento.data) return;
      const date = new Date(provento.data);
      if (!isValidProventoDate(date)) {
        return;
      }
      // UTC keys: provento.data é UTC midnight; local em BRT shifta pro mês anterior se cair em dia 1.
      const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, new Map());
      }
      const monthEntry = monthlyMap.get(monthKey)!;
      const ativo = provento.ativo || 'Desconhecido';
      ativosSet.add(ativo);
      monthEntry.set(ativo, (monthEntry.get(ativo) || 0) + provento.valor);
    });

    const sortedMonthKeys = Array.from(monthlyMap.keys()).sort((a, b) => a.localeCompare(b));
    const monthDates = sortedMonthKeys.map((key) => {
      const [year, month] = key.split('-');
      const y = Number(year);
      const m = Number(month);
      if (!Number.isFinite(y) || !Number.isFinite(m)) return 0;
      // Date.UTC para evitar drift de timezone na renderização (BRT shifta o
      // primeiro do mês para o último dia do mês anterior em local time).
      return Date.UTC(y, m - 1, 1);
    });

    const ativos = Array.from(ativosSet);
    const seriesData = ativos.map((ativo, _index) => ({
      name: ativo,
      data: sortedMonthKeys.map((key, idx) => [
        monthDates[idx],
        monthlyMap.get(key)?.get(ativo) || 0,
      ]),
    }));

    const seriesColors = ativos.map((_, index) => COLORS[index % COLORS.length]);

    // #8 (checklist mai/28): sem `xaxis.min/max` explícitos, ApexCharts cai
    // no epoch (Jan/1970) quando todas as séries estão hidden ou quando o
    // dataset vem vazio. Travar o range no primeiro/último mês válido evita
    // a rótula "Jan 1970" — e quando não há nenhum mês, o componente
    // antecipa com um EmptyState abaixo.
    const xMin = monthDates.length > 0 ? monthDates[0] : undefined;
    const xMax = monthDates.length > 0 ? monthDates[monthDates.length - 1] : undefined;

    return { series: seriesData, colors: seriesColors, xMin, xMax };
  }, [proventos]);

  const hasData = series.length > 0 && series.some((s) => s.data.length > 0);

  const options: ApexOptions = useMemo(
    () => ({
      legend: {
        show: true,
        position: 'top',
        horizontalAlign: 'left',
        fontFamily: 'Outfit, sans-serif',
        fontSize: '12px',
      },
      colors,
      chart: {
        fontFamily: 'Outfit, sans-serif',
        height: 350,
        type: 'bar',
        stacked: true,
        toolbar: {
          show: false,
        },
        locales: [
          {
            name: 'pt-BR',
            options: {
              months: [
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
              ],
              shortMonths: [
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
              ],
              days: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
              shortDays: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
            },
          },
        ],
        defaultLocale: 'pt-BR',
      },
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: '55%',
          borderRadius: 5,
          borderRadiusApplication: 'end',
        },
      },
      dataLabels: {
        enabled: false,
      },
      xaxis: {
        type: 'datetime',
        tickAmount: 6,
        min: xMin,
        max: xMax,
        axisBorder: {
          show: false,
        },
        axisTicks: {
          show: false,
        },
        labels: {
          style: {
            colors: '#64748B',
            fontSize: '12px',
          },
          formatter: (val: string) => {
            const date = new Date(Number(val));
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
            return `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
          },
        },
      },
      yaxis: {
        title: {
          text: 'Valor (R$)',
          style: {
            fontSize: '12px',
            color: '#64748B',
          },
        },
        labels: {
          style: {
            colors: '#64748B',
            fontSize: '12px',
          },
          formatter: (val: number) => {
            return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          },
        },
      },
      tooltip: {
        shared: true,
        intersect: false,
        custom: ({ series, dataPointIndex, w }) => {
          const seriesNames = w.globals.seriesNames || [];
          const colorsList = w.globals.colors || [];
          const seriesX = w.globals.seriesX || [];
          const xValue = seriesX?.[0]?.[dataPointIndex];
          const date = xValue ? new Date(xValue) : null;
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
          const title = date ? `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}` : '';

          type TooltipEntry = {
            name: string;
            value: number;
            color: string;
          };

          const entries: TooltipEntry[] = series
            .map((values: number[], index: number) => ({
              name: seriesNames[index] || 'Ativo',
              value: values?.[dataPointIndex] ?? 0,
              color: colorsList[index] || '#465FFF',
            }))
            .filter((item: TooltipEntry) => item.value > 0);

          const total = entries.reduce((sum, item) => sum + item.value, 0);
          const formatCurrency = (value: number) =>
            `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

          const rows = entries
            .map((item) => {
              const percentage = total > 0 ? (item.value / total) * 100 : 0;
              const formattedPercentage = percentage.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
              return `
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="width:8px;height:8px;border-radius:9999px;background:${item.color};display:inline-block;"></span>
                  <span style="font-size:12px;color:#111827;">${item.name}</span>
                </div>
                <span style="font-size:12px;color:#111827;">
                  ${formatCurrency(item.value)} (${formattedPercentage}%)
                </span>
              </div>
            `;
            })
            .join('');

          return `
          <div style="padding:12px 14px;min-width:220px;">
            <div style="font-size:12px;color:#111827;margin-bottom:10px;">${title}</div>
            ${rows || '<div style="font-size:12px;color:#111827;">Sem dados</div>'}
            <div style="height:1px;background:#E5E7EB;margin:10px 0;"></div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:12px;color:#111827;">Total recebido:</span>
              <span style="font-size:12px;color:#111827;font-weight:600;">${formatCurrency(total)}</span>
            </div>
            <div style="font-size:11px;color:#111827;margin-top:8px;">Toque no gráfico para o detalhamento</div>
          </div>
        `;
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
      fill: {
        opacity: 1,
      },
    }),
    [colors, xMin, xMax],
  );

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Nenhum provento no período selecionado.
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          Ajuste o filtro de período ou habilite ao menos um ativo na legenda.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-full overflow-x-auto custom-scrollbar">
      <div id="chartProventosHistorico" className="min-w-[600px] xl:min-w-full">
        <ApexChartWrapper options={options} series={series} type="bar" height={350} />
      </div>
    </div>
  );
}
