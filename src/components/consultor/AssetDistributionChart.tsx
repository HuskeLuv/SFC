"use client";

import React, { useMemo } from "react";
import { ApexOptions } from "apexcharts";
import ApexChartWrapper from "@/components/charts/ApexChartWrapper";

interface AssetDistribution {
  class: string;
  value: number;
  percentage: number;
}

interface AssetDistributionChartProps {
  data: AssetDistribution[];
  currencyFormatter: (value: number) => string;
}

// Mapeamento de tipos de ativos para cores (mesma ordem do PieChartCarteiraInvestimentos)
const ASSET_TYPE_COLORS: Record<string, string> = {
  "Reserva de Oportunidade": "#BFDBFE", // Azul pastel
  "Renda Fixa & Fundos de Renda Fixa": "#A7F3D0", // Verde pastel
  "FIM/FIA": "#DDD6FE", // Roxo pastel
  "FII's": "#FECACA", // Vermelho pastel
  "Ações": "#93C5FD", // Azul claro pastel
  "Stocks": "#BBF7D0", // Verde menta pastel
  "REIT's": "#E9D5FF", // Lilás pastel
  "ETF's": "#FED7AA", // Laranja pastel
  "Moedas, Criptomoedas & outros": "#FEF3C7", // Amarelo pastel
  "Previdência & Seguros": "#D1D5DB", // Cinza pastel
  "Opções": "#FBBF24", // Dourado pastel
  "Outros": "#9CA3AF", // Cinza médio para outros tipos
};

// Ordem padrão dos tipos de ativos (mesma ordem do PieChartCarteiraInvestimentos)
const ASSET_TYPE_ORDER = [
  "Reserva de Oportunidade",
  "Renda Fixa & Fundos de Renda Fixa",
  "FIM/FIA",
  "FII's",
  "Ações",
  "Stocks",
  "REIT's",
  "ETF's",
  "Moedas, Criptomoedas & outros",
  "Previdência & Seguros",
  "Opções",
  "Outros",
];

const AssetDistributionChart: React.FC<AssetDistributionChartProps> = ({
  data,
  currencyFormatter,
}) => {
  // Mocked dark mode state (mesmo padrão do PieChartCarteiraInvestimentos)
  const isDarkMode = true;

  // Ordenar e preparar dados no formato correto
  // Sempre incluir todos os tipos de ativos na legenda, mesmo com valor 0%
  const chartData = useMemo(() => {
    // Criar um mapa dos dados recebidos para busca rápida
    const dataMap = new Map<string, AssetDistribution>();
    data.forEach((item) => {
      dataMap.set(item.class, item);
    });

    // Criar array com todos os tipos de ativos na ordem padrão
    const allLabels = ASSET_TYPE_ORDER.filter((label) => label !== "Outros"); // Excluir "Outros" da lista padrão se não houver dados
    const labels: string[] = [];
    const series: number[] = [];
    const colors: string[] = [];

    // Adicionar todos os tipos na ordem padrão
    allLabels.forEach((label) => {
      const item = dataMap.get(label);
      labels.push(label);
      series.push(item ? Number(item.percentage.toFixed(2)) : 0);
      colors.push(ASSET_TYPE_COLORS[label] || "#D1D5DB");
    });

    // Adicionar "Outros" se existir nos dados
    const outrosItem = dataMap.get("Outros");
    if (outrosItem && outrosItem.value > 0) {
      labels.push("Outros");
      series.push(Number(outrosItem.percentage.toFixed(2)));
      colors.push(ASSET_TYPE_COLORS["Outros"] || "#D1D5DB");
    }

    return { labels, series, colors };
  }, [data]);

  const options: ApexOptions = useMemo(
    () => ({
      colors: chartData.colors,
      labels: chartData.labels,
      chart: {
        fontFamily: "Outfit, sans-serif",
        type: "donut",
      },
      stroke: {
        show: false,
        width: 4,
        colors: ["transparent"],
      },
      plotOptions: {
        pie: {
          donut: {
            size: "65%",
            background: "transparent",
            labels: {
              show: true,
              name: {
                show: true,
                offsetY: -10,
                color: isDarkMode ? "#ffffff" : "#1D2939",
                fontSize: "14px",
                fontWeight: "500",
              },
              value: {
                show: true,
                offsetY: 10,
                color: isDarkMode ? "#D1D5DB" : "#667085",
                fontSize: "12px",
                fontWeight: "400",
                formatter: (val: string) => {
                  const numeric = Number(val);
                  if (Number.isFinite(numeric)) {
                    return `${numeric.toFixed(2)}%`;
                  }
                  return "0.00%";
                },
              },
              total: {
                show: true,
                label: "Total Aplicado",
                color: isDarkMode ? "#ffffff" : "#000000",
                fontSize: "16px",
                fontWeight: "bold",
                formatter: () => {
                  const total = data.reduce((sum, item) => sum + item.value, 0);
                  return currencyFormatter(total);
                },
              },
            },
          },
          expandOnClick: false,
        },
      },
      dataLabels: {
        enabled: false,
      },
      tooltip: {
        enabled: true,
        y: {
          formatter: (_val, opts) => {
            if (opts?.seriesIndex !== undefined) {
              const label = chartData.labels[opts.seriesIndex];
              const percentage = chartData.series[opts.seriesIndex] || 0;
              
              // Buscar o valor real nos dados originais
              const originalItem = data.find((d) => d.class === label);
              if (originalItem) {
                return `${label}: ${currencyFormatter(originalItem.value)} (${percentage.toFixed(2)}%)`;
              }
              // Se não encontrou, mostrar apenas o percentual (0%)
              return `${label}: ${currencyFormatter(0)} (${percentage.toFixed(2)}%)`;
            }
            const seriesValue = opts?.series?.[opts.seriesIndex ?? 0] ?? 0;
            const numeric = Number(seriesValue);
            return Number.isFinite(numeric) ? `${numeric.toFixed(2)}%` : "0.00%";
          },
        },
      },
      legend: {
        show: true,
        position: "bottom",
        fontFamily: "Outfit, sans-serif",
        fontWeight: 400,
        fontSize: "14px",
        colors: isDarkMode ? ["#ffffff"] : ["#000000"],
        labels: {
          colors: isDarkMode ? "#ffffff" : "#000000",
        },
        formatter: (seriesName: string, opts?: { seriesIndex?: number }) => {
          if (opts?.seriesIndex !== undefined) {
            const percentage = chartData.series[opts.seriesIndex] || 0;
            return `${seriesName} (${percentage.toFixed(2)}%)`;
          }
          return seriesName;
        },
        markers: {
          width: 8,
          height: 8,
          strokeWidth: 0,
          strokeColor: "#fff",
          fillColors: undefined,
          radius: 12,
          customHTML: undefined,
          onClick: undefined,
          offsetX: 0,
          offsetY: 0,
        },
        itemMargin: {
          horizontal: 15,
          vertical: 8,
        },
      },
      responsive: [
        {
          breakpoint: 768,
          options: {
            chart: {
              width: 350,
            },
            legend: {
              fontSize: "12px",
              itemMargin: {
                horizontal: 8,
                vertical: 4,
              },
            },
          },
        },
        {
          breakpoint: 480,
          options: {
            chart: {
              width: 280,
            },
            legend: {
              show: false,
            },
          },
        },
      ],
    }),
    [data, currencyFormatter, chartData, isDarkMode],
  );

  if (data.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-white/[0.02]">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Sem dados de distribuição de ativos
        </p>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <div className="mx-auto">
        <ApexChartWrapper
          options={options}
          series={chartData.series}
          type="donut"
          width="100%"
          height="350"
        />
      </div>
    </div>
  );
};

export default AssetDistributionChart;

