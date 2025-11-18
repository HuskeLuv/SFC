"use client";

import React, { useMemo } from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

interface PatrimonyEvolution {
  month: string;
  totalPatrimony: number;
}

interface PatrimonioEvolucaoChartProps {
  data: PatrimonyEvolution[];
  currencyFormatter: (value: number) => string;
}

const PatrimonioEvolucaoChart: React.FC<PatrimonioEvolucaoChartProps> = ({
  data,
  currencyFormatter,
}) => {
  const chartData = useMemo(() => {
    if (data.length === 0) {
      return {
        categories: [],
        series: [],
      };
    }

    const categories = data.map((item) => {
      const date = new Date(item.month);
      const months = [
        "Jan",
        "Fev",
        "Mar",
        "Abr",
        "Mai",
        "Jun",
        "Jul",
        "Ago",
        "Set",
        "Out",
        "Nov",
        "Dez",
      ];
      return `${months[date.getMonth()]} ${date.getFullYear()}`;
    });

    const series = data.map((item) => item.totalPatrimony);

    return { categories, series };
  }, [data]);

  const options: ApexOptions = useMemo(
    () => ({
      colors: ["#465FFF"],
      chart: {
        fontFamily: "Outfit, sans-serif",
        height: 350,
        type: "area",
        toolbar: {
          show: false,
        },
      },
      stroke: {
        curve: "smooth",
        width: 3,
      },
      dataLabels: {
        enabled: false,
      },
      markers: {
        size: 4,
        hover: {
          size: 6,
        },
      },
      xaxis: {
        categories: chartData.categories,
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
          rotate: -45,
          rotateAlways: false,
        },
      },
      yaxis: {
        title: {
          text: "",
          style: {
            fontSize: "0px",
          },
        },
        labels: {
          style: {
            colors: "#64748B",
            fontSize: "12px",
          },
          formatter: (val: number) => {
            if (val >= 1000000) {
              return `R$ ${(val / 1000000).toFixed(1)}M`;
            }
            if (val >= 1000) {
              return `R$ ${(val / 1000).toFixed(0)}K`;
            }
            return `R$ ${val.toFixed(0)}`;
          },
        },
      },
      tooltip: {
        x: {
          format: "MMM yyyy",
        },
        y: {
          formatter: (val: number) => currencyFormatter(val),
        },
      },
      fill: {
        type: "gradient",
        gradient: {
          opacityFrom: 0.55,
          opacityTo: 0,
          gradientToColors: ["#465FFF"],
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
    }),
    [chartData.categories, currencyFormatter],
  );

  const series = useMemo(
    () => [
      {
        name: "Patrimônio Total",
        data: chartData.series,
      },
    ],
    [chartData.series],
  );

  if (data.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-white/[0.02]">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Sem dados de evolução do patrimônio
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div id="patrimony-evolution-chart">
        <ReactApexChart
          options={options}
          series={series}
          type="area"
          height={350}
        />
      </div>
    </div>
  );
};

export default PatrimonioEvolucaoChart;

