"use client";
import React, { useEffect, useState, useMemo } from "react";
import { ApexOptions } from "apexcharts";

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

interface ProventosHistoricoChartProps {
  data: Array<{
    date: number;
    valor: number;
  }>;
}

export default function ProventosHistoricoChart({ data }: ProventosHistoricoChartProps) {
  const series = useMemo(() => [
    {
      name: "Proventos",
      data: data.map(item => [item.date, item.valor]),
    },
  ], [data]);

  const options: ApexOptions = useMemo(() => ({
    legend: {
      show: false,
    },
    colors: ["#465FFF"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      height: 350,
      type: "bar",
      toolbar: {
        show: false,
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
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "60%",
        borderRadius: 5,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: {
      enabled: false,
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
          return `${months[date.getMonth()]} ${date.getFullYear()}`;
        },
      },
    },
    yaxis: {
      title: {
        text: "Valor (R$)",
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
          return `R$ ${(val / 1000).toFixed(0)}K`;
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
          return `${months[date.getMonth()]} ${date.getFullYear()}`;
        },
      },
      y: {
        formatter: (val: number) => {
          return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    fill: {
      opacity: 1,
    },
  }), []);

  return (
    <div className="max-w-full overflow-x-auto custom-scrollbar">
      <div id="chartProventosHistorico" className="min-w-[600px] xl:min-w-full">
        <ApexChartWrapper
          options={options}
          series={series}
          type="bar"
          height={350}
        />
      </div>
    </div>
  );
}

