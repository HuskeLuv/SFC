"use client";
import React, { useEffect, useState, useMemo } from "react";
import { ApexOptions } from "apexcharts";
import { GroupedProventoData } from "@/hooks/useProventos";

const ApexChartWrapper = React.memo(({ options, series, type, height }: {
  options: ApexOptions;
  series: number[] | Array<{ name: string; data: number[] }>;
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

interface ProventosDistribuicaoChartProps {
  grouped: Record<string, GroupedProventoData>;
  viewMode: "total" | "yield";
}

const COLORS = [
  '#465FFF', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444',
  '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1'
];

export default function ProventosDistribuicaoChart({ grouped, viewMode }: ProventosDistribuicaoChartProps) {
  const { series, labels } = useMemo(() => {
    const entries = Object.entries(grouped).sort((a, b) => b[1].total - a[1].total);
    
    const data = entries.map(([, data]) => {
      if (viewMode === "yield") {
        return data.yoc || 0;
      }
      return data.total;
    });
    
    const names = entries.map(([name]) => name);
    
    return {
      series: data,
    labels: names,
  };
}, [grouped, viewMode]);

  const options: ApexOptions = useMemo(() => ({
    labels: labels,
    legend: {
      show: true,
      position: "bottom",
      horizontalAlign: "center",
      fontFamily: "Outfit, sans-serif",
      fontSize: "12px",
    },
    colors: COLORS,
    chart: {
      fontFamily: "Outfit, sans-serif",
      height: 400,
      type: "donut",
      toolbar: {
        show: false,
      },
    },
    dataLabels: {
      enabled: true,
      formatter: (val: number) => {
        return viewMode === "yield" ? `${val.toFixed(2)}%` : `${val.toFixed(2)}%`;
      },
    },
    tooltip: {
      y: {
        formatter: (val: number) => {
          if (viewMode === "yield") {
            return `${val.toFixed(2)}%`;
          }
          return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        },
      },
    },
    plotOptions: {
      pie: {
        donut: {
          size: "70%",
          labels: {
            show: true,
            name: {
              show: true,
              fontSize: "14px",
              fontWeight: 600,
            },
            value: {
              show: true,
              fontSize: "16px",
              fontWeight: 700,
              formatter: (val: string) => {
                return `R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
              },
            },
            total: {
              show: true,
              label: viewMode === "yield" ? "Yield on Cost" : "Total",
              fontSize: "14px",
              fontWeight: 600,
              formatter: () => {
                const total = series.reduce((sum, val) => sum + val, 0);
                if (viewMode === "yield") {
                  return `${total.toFixed(2)}%`;
                }
                return `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
              },
            },
          },
        },
      },
    },
  }), [series, viewMode]);

  const chartSeries = useMemo(() => series, [series]);

  return (
    <div className="max-w-full overflow-x-auto custom-scrollbar">
      <div id="chartProventosDistribuicao" className="min-w-[600px] xl:min-w-full">
        <ApexChartWrapper
          options={options}
          series={chartSeries}
          type="donut"
          height={400}
        />
      </div>
    </div>
  );
}

