"use client";
import React, { useMemo } from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

// Dynamically import the ReactApexChart component
const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

interface PieChartPrevidenciaSegurosAtivoProps {
  data: Array<{
    nome: string;
    percentual: number;
    valor: number;
  }>;
}

export default function PieChartPrevidenciaSegurosAtivo({ data }: PieChartPrevidenciaSegurosAtivoProps) {
  // Mocked dark mode state (replace with actual context/state if applicable)
  const isDarkMode = true; // Change this to your dark mode logic

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return { series: [], labels: [] };
    
    return {
      series: data.map(item => item.percentual),
      labels: data.map(item => item.nome),
    };
  }, [data]);

  // Chart configuration using useMemo for optimization
  const options: ApexOptions = useMemo(
    () => ({
      colors: ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#84CC16", "#F97316", "#EC4899", "#6B7280"],
      labels: chartData.labels,
      chart: {
        fontFamily: "Outfit, sans-serif",
        type: "donut",
        width: "100%",
        height: 300,
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
                formatter: (val: string) => `${val}%`,
              },
              total: {
                show: true,
                label: "Total",
                color: isDarkMode ? "#ffffff" : "#000000",
                fontSize: "16px",
                fontWeight: "bold",
                formatter: () => "100%",
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
          formatter: function(val: number, { seriesIndex, w }) {
            const nome = w.globals.labels[seriesIndex];
            const percentual = val;
            const valor = data[seriesIndex]?.valor || 0;
            return `${nome}: ${percentual.toFixed(2)}% (R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
          }
        }
      },
      legend: {
        show: true,
        position: "bottom",
        horizontalAlign: "center",
        fontFamily: "Outfit",
        fontSize: "12px",
        fontWeight: 400,
        markers: {
          size: 4,
          shape: "circle",
          strokeWidth: 0,
        },
        itemMargin: {
          horizontal: 10,
          vertical: 0,
        },
        labels: {
          useSeriesColors: true,
        },
      },
      responsive: [
        {
          breakpoint: 640,
          options: {
            chart: {
              height: 250,
            },
            legend: {
              fontSize: "10px",
            },
          },
        },
      ],
    }),
    [chartData.labels, isDarkMode, data]
  );

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Nenhum dado disponível para exibir
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <ReactApexChart
        options={options}
        series={chartData.series}
        type="donut"
        height={300}
      />
    </div>
  );
}

