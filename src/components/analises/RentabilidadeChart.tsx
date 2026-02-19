"use client";
import React, { useEffect, useState, useMemo, Component, ErrorInfo, ReactNode } from "react";
import { ApexOptions } from "apexcharts";
import { IndexData, IndexResponse } from "@/hooks/useIndices";

// Error Boundary para capturar erros do ApexCharts
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-80 items-center justify-center text-sm text-red-500">
          Erro ao renderizar gráfico: {this.state.error?.message || 'Erro desconhecido'}
        </div>
      );
    }

    return this.props.children;
  }
}

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

  const sanitizedSeries = series.map(s => {
    if (!s || !s.name || !Array.isArray(s.data)) {
      return null;
    }
    // Garantir que todos os pontos são arrays válidos com 2 elementos
    const sanitizedData = s.data
      .map(point => {
        if (!Array.isArray(point) || point.length !== 2) {
          return null;
        }
        const [date, value] = point;
        if (typeof date !== 'number' || !Number.isFinite(date)) {
          return null;
        }
        // Garantir que o valor é um número (substituir null/undefined por 0)
        const numValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
        return [date, numValue] as number[];
      })
      .filter((point): point is number[] => point !== null);
    
    if (sanitizedData.length === 0) {
      return null;
    }
    
    return {
      name: s.name,
      data: sanitizedData,
    };
  }).filter((s): s is { name: string; data: number[][] } => s !== null);

  if (sanitizedSeries.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        Sem dados válidos para exibir.
      </div>
    );
  }

  // Usar Error Boundary para capturar erros do ApexCharts
  return (
    <ErrorBoundary>
      <div data-testid="apex-chart-container">
        <Chart options={sanitizedOptions} series={sanitizedSeries} type={type} height={height} />
      </div>
    </ErrorBoundary>
  );
});

ApexChartWrapper.displayName = 'ApexChartWrapper';

interface RentabilidadeChartProps {
  carteiraData: IndexData[];
  indicesData: IndexResponse[];
  period: '1d' | '1mo' | '1y';
  /** Filtra a exibição ao período (ex: Relatórios) */
  startTimestamp?: number;
  endTimestamp?: number;
}

/** Normaliza timestamp para meia-noite local (alinhar datas de timezones diferentes) */
const toDayKey = (ts: number): number => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

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
  if (!Array.isArray(data) || data.length === 0) return [];
  
  const monthlyMap = new Map<number, IndexData>();
  
  data.forEach(item => {
    if (!item || typeof item.date !== 'number' || typeof item.value !== 'number') {
      return; // Ignorar itens inválidos
    }
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
  if (!Array.isArray(data) || data.length === 0) return [];
  
  const yearlyMap = new Map<number, IndexData>();
  
  data.forEach(item => {
    if (!item || typeof item.date !== 'number' || typeof item.value !== 'number') {
      return; // Ignorar itens inválidos
    }
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
  startTimestamp,
  endTimestamp,
}: RentabilidadeChartProps) {
  const series = useMemo(() => {
    const seriesData: Array<{ name: string; data: number[][] }> = [];

    // Validar carteiraData
    if (!Array.isArray(carteiraData)) {
      return seriesData;
    }

    // Validar indicesData
    if (!Array.isArray(indicesData)) {
      return seriesData;
    }

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
    if (Array.isArray(processedCarteiraData) && processedCarteiraData.length > 0) {
      const carteiraPoints = processedCarteiraData
        .map(item => {
          if (!item || typeof item.date !== 'number' || typeof item.value !== 'number') {
            return null;
          }
          return [item.date, item.value] as [number, number];
        })
        .filter((point): point is [number, number] => point !== null && Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]));
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
      // Validações mais rigorosas
      if (!index || typeof index !== 'object') {
        return;
      }
      if (!index.name || typeof index.name !== 'string') {
        return;
      }
      if (!Array.isArray(index.data)) {
        return;
      }
      if (index.data.length === 0) {
        return;
      }
      if (!allowedIndices.includes(index.name)) {
        return;
      }

      // Processar dados do índice
      let processedIndexData: IndexData[];
      try {
        if (period === '1mo') {
          processedIndexData = groupByMonth(index.data);
        } else if (period === '1y') {
          processedIndexData = groupByYear(index.data);
        } else {
          processedIndexData = index.data;
        }
      } catch (error) {
        console.warn(`Erro ao processar dados do índice ${index.name}:`, error);
        return;
      }

      // Validar que processedIndexData é um array válido
      if (!Array.isArray(processedIndexData) || processedIndexData.length === 0) {
        return;
      }

      const indexPoints = processedIndexData
        .map(item => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          if (typeof item.date !== 'number' || !Number.isFinite(item.date)) {
            return null;
          }
          // Garantir que o valor é um número válido, substituindo null/undefined por 0
          const value = typeof item.value === 'number' && Number.isFinite(item.value) ? item.value : 0;
          return [item.date, value] as number[];
        })
        .filter((point): point is number[] => point !== null && Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]));

      if (indexPoints.length > 0) {
        seriesData.push({
          name: index.name,
          data: indexPoints,
        });
      }
    });

    if (period !== '1d' || seriesData.length === 0) {
      return seriesData;
    }

    // Validar que todas as séries têm dados válidos
    const validSeries = seriesData.filter(serie => 
      Array.isArray(serie.data) && 
      serie.data.length > 0 &&
      serie.data.every(point => Array.isArray(point) && point.length >= 2)
    );

    if (validSeries.length === 0) {
      return [];
    }

    // Coletar todas as datas (normalizadas para meia-noite local) para alinhar timezones
    const allDatesSet = new Set<number>();
    validSeries.forEach(serie => {
      serie.data.forEach(point => {
        if (Array.isArray(point) && point.length >= 2 && typeof point[0] === 'number' && Number.isFinite(point[0])) {
          allDatesSet.add(toDayKey(point[0]));
        }
      });
    });
    let allDates = Array.from(allDatesSet).sort((a, b) => a - b);

    if (allDates.length === 0) {
      return [];
    }

    const finalAlignedSeries = validSeries.map((serie) => {
      if (!Array.isArray(serie.data) || serie.data.length === 0) {
        return {
          name: serie.name,
          data: [],
        };
      }

      const valueByDate = new Map<number, number | null>();
      serie.data.forEach(point => {
        if (Array.isArray(point) && point.length >= 2 && typeof point[0] === 'number' && Number.isFinite(point[0])) {
          const value = point[1];
          if (value === null || (typeof value === 'number' && Number.isFinite(value))) {
            valueByDate.set(toDayKey(point[0]), value);
          }
        }
      });
      
      let lastValue: number | null = null;

      const alignedData: number[][] = allDates.map((date) => {
        if (valueByDate.has(date)) {
          lastValue = valueByDate.get(date) ?? null;
          return [date, lastValue !== null && Number.isFinite(lastValue) ? lastValue : 0];
        }
        return [date, lastValue !== null && Number.isFinite(lastValue) ? lastValue : 0];
      });

      // Verificar se a série tem pelo menos um valor válido (não-zero)
      const hasValidValue = alignedData.some(point => Number.isFinite(point[1]) && point[1] !== 0);
      
      if (!hasValidValue) {
        return null;
      }

      // Verificar se a série começa apenas com zeros (pode causar problemas no ApexCharts)
      const firstValidIndex = alignedData.findIndex(point => Number.isFinite(point[1]) && point[1] !== 0);
      
      if (firstValidIndex > alignedData.length * 0.1 && firstValidIndex > 0) {
        const trimmedData = alignedData.slice(firstValidIndex > 0 ? firstValidIndex - 1 : 0);
        return {
          name: serie.name,
          data: trimmedData,
        };
      }

      return {
        name: serie.name,
        data: alignedData,
      };
    }).filter((serie): serie is { name: string; data: number[][] } => serie !== null);

    // Filtrar ao período quando startTimestamp/endTimestamp fornecidos (ex: Relatórios)
    if (startTimestamp != null || endTimestamp != null) {
      return finalAlignedSeries.map((serie) => ({
        ...serie,
        data: serie.data.filter((point) => {
          const ts = point[0];
          if (startTimestamp != null && ts < startTimestamp) return false;
          if (endTimestamp != null && ts > endTimestamp) return false;
          return true;
        }),
      })).filter((serie) => serie.data.length > 0);
    }

    return finalAlignedSeries;
  }, [carteiraData, indicesData, period, startTimestamp, endTimestamp]);

  const chartType = period === '1mo' || period === '1y' ? 'bar' : 'line';

  // Calcular número de anos únicos quando período for anual (após agrupamento)
  const uniqueYearsCount = useMemo(() => {
    if (period !== '1y') return undefined;
    
    // Agrupar dados para contar anos únicos
    let processedCarteiraData: IndexData[];
    if (Array.isArray(carteiraData) && carteiraData.length > 0) {
      processedCarteiraData = groupByYear(carteiraData);
    } else {
      processedCarteiraData = [];
    }
    
    const allDates: number[] = [];
    if (Array.isArray(processedCarteiraData) && processedCarteiraData.length > 0) {
      allDates.push(...processedCarteiraData.map(item => item.date));
    }
    indicesData.forEach(index => {
      if (Array.isArray(index.data) && index.data.length > 0) {
        const processedIndexData = groupByYear(index.data);
        if (Array.isArray(processedIndexData)) {
          allDates.push(...processedIndexData.map(item => item.date));
        }
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
        width: 2, // Número, não array!
        colors: ["transparent"],
      };
    }

    return baseOptions;
  }, [period, chartType, uniqueYearsCount]);

  const hasSeriesData = Array.isArray(series) && series.length > 0;

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
