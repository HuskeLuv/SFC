"use client";
import React, { useEffect, useState, useMemo } from "react";
import { ApexOptions } from "apexcharts";
import { IndexData, IndexResponse } from "@/hooks/useIndices";

// Componente wrapper para o ReactApexChart
const ApexChartWrapper = React.memo(({ options, series, type, height }: {
  options: ApexOptions;
  series: Array<{ name: string; data: number[][] }>;
  type: string;
  height: number;
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [Chart, setChart] = useState<React.ComponentType<any> | null>(null);

  const sanitizedOptions = useMemo(() => {
    try {
      return JSON.parse(JSON.stringify(options)) as ApexOptions;
    } catch {
      return options;
    }
  }, [options]);

  useEffect(() => {
    const loadChart = async () => {
      try {
        const ReactApexChart = (await import("react-apexcharts")).default;
        setChart(() => ReactApexChart);
      } catch (error) {
        console.error("Erro ao carregar ApexCharts:", error);
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
});

ApexChartWrapper.displayName = 'ApexChartWrapper';

interface RentabilidadeChartProps {
  carteiraData: IndexData[];
  indicesData: IndexResponse[];
  period: '1d' | '1mo' | '1y';
}

// Cores para cada série
const COLORS = [
  '#465FFF', // Carteira (azul)
  '#10B981', // IBOV (verde)
  '#F59E0B', // IFIX (laranja)
  '#8B5CF6', // Poupança (roxo)
  '#EF4444', // IPCA (vermelho)
  '#06B6D4', // IBRX (ciano)
  '#84CC16', // IMA-B (verde claro)
];

export default function RentabilidadeChart({
  carteiraData,
  indicesData,
  period,
}: RentabilidadeChartProps) {
  const series = useMemo(() => {
    const seriesData: Array<{ name: string; data: number[][] }> = [];

    // Adicionar série da Carteira
    if (carteiraData.length > 0) {
      seriesData.push({
        name: 'Carteira',
        data: carteiraData.map(item => [item.date, item.value]),
      });
    }

    // Adicionar séries dos índices
    indicesData.forEach((index, idx) => {
      if (index.data.length > 0) {
        seriesData.push({
          name: index.name,
          data: index.data.map(item => [item.date, item.value]),
        });
      }
    });

    return seriesData;
  }, [carteiraData, indicesData]);

  const options: ApexOptions = useMemo(() => ({
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontFamily: "Outfit, sans-serif",
      fontSize: "14px",
      fontWeight: 400,
      markers: {
        size: 5,
        shape: "circle",
        strokeWidth: 0,
      },
    },
    colors: COLORS,
    chart: {
      fontFamily: "Outfit, sans-serif",
      height: 400,
      type: "line",
      toolbar: {
        show: false,
      },
      zoom: {
        enabled: false,
      },
      locales: [{
        name: 'pt-BR',
        options: {
          months: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
          shortMonths: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
          days: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
          shortDays: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
        }
      }],
      defaultLocale: 'pt-BR',
    },
    stroke: {
      curve: "smooth",
      width: [2, 2, 2, 2, 2, 2, 2],
    },
    dataLabels: {
      enabled: false,
    },
    markers: {
      size: 0,
    },
    xaxis: {
      type: "datetime",
      tickAmount: 6,
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
      labels: {
        style: {
          colors: "#64748B",
          fontSize: "12px",
        },
        formatter: (val: string) => {
          const date = new Date(Number(val));
          const months = [
            'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
            'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
          ];
          if (period === '1d') {
            return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
          }
          // Para períodos mensais e anuais, usar abreviação em português
          // Se o período for mensal, mostrar mês completo
          if (period === '1mo') {
            const monthsFull = [
              'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
              'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
            ];
            return `${monthsFull[date.getMonth()]} ${date.getFullYear()}`;
          }
          return `${months[date.getMonth()]} ${date.getFullYear()}`;
        },
      },
    },
    yaxis: {
      decimalsInFloat: 2,
      forceNiceScale: true,
      title: {
        text: "Retorno (%)",
        style: {
          fontSize: "12px",
          color: "#64748B",
        },
      },
      labels: {
        style: {
          colors: "#64748B",
          fontSize: "12px",
        },
        formatter: (val: number) => {
          // Garantir que sempre mostra 2 casas decimais, removendo zeros desnecessários
          const num = Number(val);
          if (isNaN(num)) return '0.00%';
          const formatted = num.toFixed(2);
          return `${formatted}%`;
        },
      },
    },
    tooltip: {
      x: {
        formatter: (val: number) => {
          const date = new Date(val);
          const months = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
          ];
          if (period === '1d') {
            return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
          }
          return `${months[date.getMonth()]} ${date.getFullYear()}`;
        },
      },
      y: {
        formatter: (val: number) => {
          return `${val.toFixed(2)}%`;
        },
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
      borderColor: "#E5E7EB",
    },
  }), [period]);

  return (
    <div className="max-w-full overflow-x-auto custom-scrollbar">
      <div id="chartRentabilidade" className="min-w-[600px] xl:min-w-full">
        <ApexChartWrapper
          options={options}
          series={series}
          type="line"
          height={400}
        />
      </div>
    </div>
  );
}

