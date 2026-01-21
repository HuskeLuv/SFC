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

// Função para agrupar dados por mês (pega o último valor de cada mês)
const groupByMonth = (data: IndexData[]): IndexData[] => {
  if (data.length === 0) return [];
  
  const monthlyMap = new Map<number, IndexData>();
  
  data.forEach(item => {
    const date = new Date(item.date);
    // Criar chave para o mês (primeiro dia do mês)
    const monthKey = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    
    // Sempre pegar o último valor do mês (sobrescrever se já existir)
    monthlyMap.set(monthKey, {
      date: monthKey,
      value: item.value,
    });
  });
  
  return Array.from(monthlyMap.values()).sort((a, b) => a.date - b.date);
};

// Função para agrupar dados por ano (pega o último valor de cada ano)
const groupByYear = (data: IndexData[]): IndexData[] => {
  if (data.length === 0) return [];
  
  const yearlyMap = new Map<number, IndexData>();
  
  data.forEach(item => {
    const date = new Date(item.date);
    // Criar chave para o ano (primeiro dia do ano)
    const yearKey = new Date(date.getFullYear(), 0, 1).getTime();
    
    // Sempre pegar o último valor do ano (sobrescrever se já existir)
    yearlyMap.set(yearKey, {
      date: yearKey,
      value: item.value,
    });
  });
  
  return Array.from(yearlyMap.values()).sort((a, b) => a.date - b.date);
};

export default function RentabilidadeChart({
  carteiraData,
  indicesData,
  period,
}: RentabilidadeChartProps) {
  const series = useMemo(() => {
    const seriesData: Array<{ name: string; data: number[][] }> = [];

    // Agrupar dados conforme o período
    let processedCarteiraData: IndexData[];
    if (period === '1mo') {
      processedCarteiraData = groupByMonth(carteiraData);
    } else if (period === '1y') {
      processedCarteiraData = groupByYear(carteiraData);
    } else {
      processedCarteiraData = carteiraData;
    }

    // Adicionar série da Carteira
    if (processedCarteiraData.length > 0) {
      const carteiraPoints = processedCarteiraData
        .map(item => [item.date, item.value] as number[])
        .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
      if (carteiraPoints.length > 0) {
        seriesData.push({
          name: 'Carteira',
          data: carteiraPoints,
        });
      }
    }

    // Filtrar e adicionar apenas os índices desejados: CDI, IBOV, IPCA e Poupança
    const allowedIndices = ['CDI', 'IBOV', 'IPCA', 'Poupança'];
    indicesData.forEach((index) => {
      if (Array.isArray(index.data) && index.data.length > 0 && allowedIndices.includes(index.name)) {
        let processedIndexData: IndexData[];
        if (period === '1mo') {
          processedIndexData = groupByMonth(index.data);
        } else if (period === '1y') {
          processedIndexData = groupByYear(index.data);
        } else {
          processedIndexData = index.data;
        }
        const indexPoints = processedIndexData
          .map(item => [item.date, item.value] as number[])
          .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
        if (indexPoints.length > 0) {
          seriesData.push({
            name: index.name,
            data: indexPoints,
          });
        }
      }
    });

    return seriesData;
  }, [carteiraData, indicesData, period]);

  const chartType = period === '1mo' || period === '1y' ? 'bar' : 'line';

  // Calcular número de anos únicos quando período for anual (após agrupamento)
  const uniqueYearsCount = useMemo(() => {
    if (period !== '1y') return undefined;
    
    // Agrupar dados para contar anos únicos
    let processedCarteiraData: IndexData[];
    if (carteiraData.length > 0) {
      processedCarteiraData = groupByYear(carteiraData);
    } else {
      processedCarteiraData = [];
    }
    
    const allDates: number[] = [];
    if (processedCarteiraData.length > 0) {
      allDates.push(...processedCarteiraData.map(item => item.date));
    }
    indicesData.forEach(index => {
      if (index.data.length > 0) {
        const processedIndexData = groupByYear(index.data);
        allDates.push(...processedIndexData.map(item => item.date));
      }
    });
    
    const uniqueYears = new Set(allDates.map(date => new Date(date).getFullYear()));
    return uniqueYears.size > 0 ? uniqueYears.size : undefined;
  }, [period, carteiraData, indicesData]);

  const options: ApexOptions = useMemo(() => {
    const baseOptions: ApexOptions = {
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
        height: 300,
        type: chartType,
        width: '100%',
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
      dataLabels: {
        enabled: false,
      },
    xaxis: {
      type: "datetime",
      tickAmount: period === '1y' ? uniqueYearsCount : 6,
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
        showDuplicates: false,
        formatter: (val: string) => {
          const date = new Date(Number(val));
          if (period === '1d') {
            return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
          }
          if (period === '1mo') {
            const monthsFull = [
              'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
              'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
            ];
            return `${monthsFull[date.getMonth()]} ${date.getFullYear()}`;
          }
          if (period === '1y') {
            return date.getFullYear().toString();
          }
          const months = [
            'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
            'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
          ];
          return `${months[date.getMonth()]} ${date.getFullYear()}`;
        },
      },
    },
    yaxis: {
      decimalsInFloat: 2,
      forceNiceScale: true,
      title: {
        text: period === '1mo' ? "% por mês" : period === '1y' ? "% por ano" : "Retorno (%)",
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
      shared: true,
      intersect: false,
      x: {
        formatter: (val: number) => {
          const date = new Date(val);
          if (period === '1d') {
            return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
          }
          if (period === '1y') {
            return date.getFullYear().toString();
          }
          const months = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
          ];
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
    };

    // Configurações específicas para gráfico de linha
    if (chartType === 'line') {
      baseOptions.stroke = {
        curve: "smooth",
        width: [2, 2, 2, 2, 2, 2, 2],
      };
      baseOptions.markers = {
        size: 0,
      };
    }

    // Configurações específicas para gráfico de barras
    if (chartType === 'bar') {
      baseOptions.plotOptions = {
        bar: {
          horizontal: false,
          columnWidth: "55%",
          borderRadius: 4,
          borderRadiusApplication: "end",
        },
      };
      baseOptions.fill = {
        opacity: 1,
      };
      baseOptions.stroke = {
        show: true,
        width: 2,
        colors: ["transparent"],
      };
    }

    return baseOptions;
  }, [period, chartType, uniqueYearsCount]);

  const hasSeriesData = series.length > 0;

  return (
    <div className="w-full">
      {hasSeriesData ? (
        <div className="w-full">
          <ApexChartWrapper
            options={options}
            series={series}
            type={chartType}
            height={300}
          />
        </div>
      ) : (
        <div className="flex h-80 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          Sem dados para o período selecionado.
        </div>
      )}
    </div>
  );
}

