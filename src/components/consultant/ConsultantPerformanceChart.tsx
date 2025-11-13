"use client";

import dynamic from "next/dynamic";
import React from "react";
import type { ApexOptions } from "apexcharts";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

type PerformancePoint = {
  label: string;
  value: number;
};

interface ConsultantPerformanceChartProps {
  data: PerformancePoint[];
  isLoading?: boolean;
}

const chartBaseOptions: ApexOptions = {
  chart: {
    type: "area",
    height: 320,
    toolbar: { show: false },
    fontFamily: "Outfit, sans-serif",
  },
  stroke: {
    curve: "smooth",
    width: 3,
  },
  fill: {
    type: "gradient",
    gradient: {
      shadeIntensity: 0.4,
      opacityFrom: 0.4,
      opacityTo: 0.05,
    },
  },
  colors: ["#465FFF"],
  dataLabels: {
    enabled: false,
  },
  grid: {
    borderColor: "rgba(148, 163, 184, 0.2)",
    strokeDashArray: 4,
  },
  markers: {
    size: 4,
    strokeWidth: 2,
    hover: {
      size: 7,
    },
  },
  legend: {
    show: false,
  },
  yaxis: {
    labels: {
      formatter: (value) =>
        value.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
          maximumFractionDigits: 0,
        }),
    },
  },
  xaxis: {
    type: "category",
    axisBorder: { show: false },
    axisTicks: { show: false },
    labels: {
      style: {
        colors: "#64748B",
      },
    },
  },
  tooltip: {
    y: {
      formatter: (value) =>
        value.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        }),
    },
  },
};

const ConsultantPerformanceChart: React.FC<ConsultantPerformanceChartProps> = ({
  data,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Carregando desempenho...
        </span>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700 dark:text-white/80">
            Sem dados no período
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Os clientes ainda não possuem movimentações recentes para gerar o desempenho agregado.
          </p>
        </div>
      </div>
    );
  }

  const categories = data.map((point) => point.label);
  const series = [
    {
      name: "Média mensal",
      data: data.map((point) => Number(point.value.toFixed(2))),
    },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
        Desempenho agregado dos clientes
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Média mensal das movimentações líquidas dos clientes nos últimos meses.
      </p>
      <div className="mt-6">
        <ReactApexChart
          options={{
            ...chartBaseOptions,
            xaxis: {
              ...chartBaseOptions.xaxis,
              categories,
            },
          }}
          series={series}
          type="area"
          height={320}
        />
      </div>
    </div>
  );
};

export type { PerformancePoint };
export default ConsultantPerformanceChart;

