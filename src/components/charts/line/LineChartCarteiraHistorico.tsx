"use client";
import React, { useEffect, useState, useMemo } from "react";
import { ApexOptions } from "apexcharts";

// Componente wrapper para o ReactApexChart
const ApexChartWrapper = React.memo(({ options, series, type, height }: {
  options: ApexOptions;
  series: Array<{ name: string; data: number[][] }>;
  type: string;
  height: number;
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [Chart, setChart] = useState<React.ComponentType<any> | null>(null);

  const hasFunctionValue = (value: unknown): boolean => {
    if (typeof value === "function") {
      return true;
    }

    if (!value) {
      return false;
    }

    if (Array.isArray(value)) {
      return value.some((item) => hasFunctionValue(item));
    }

    if (typeof value !== "object") {
      return false;
    }

    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (hasFunctionValue((value as Record<string, unknown>)[key])) {
        return true;
      }
    }

    return false;
  };

  // IMPORTANTE: useMemo deve ser chamado antes de qualquer early return para manter ordem dos hooks
  // Sanitizar options para evitar enumeração de searchParams pelo ApexCharts
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
    // Importação dinâmica do ReactApexChart apenas no client-side
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

interface LineChartCarteiraHistoricoProps {
  data: Array<{
    data: number;
    valor: number;
  }>;
}

export default function LineChartCarteiraHistorico({ data: historicoData }: LineChartCarteiraHistoricoProps) {
  // Converter dados recebidos para formato do gráfico
  const data = useMemo(() => 
    historicoData.map(item => [item.data, item.valor]),
    [historicoData]
  );

  const options: ApexOptions = useMemo(() => ({
    legend: {
      show: false,
      position: "top",
      horizontalAlign: "left",
    },
    colors: ["#465FFF"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      height: 335,
      id: "patrimonio-historico",
      type: "area",
      toolbar: {
        show: false,
      },
    },
    stroke: {
      curve: "smooth",
      width: [2],
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
      tooltip: {
        enabled: false,
      },
      labels: {
        style: {
          colors: "#64748B",
          fontSize: "12px",
        },
        formatter: (val: string) => {
          const date = new Date(val);
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
          return `R$ ${(val / 1000).toFixed(0)}K`;
        },
      },
    },
    tooltip: {
      x: {
        format: "MMM yyyy",
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
  }), []);

  const series = useMemo(() => [
    {
      name: "Patrimônio",
      data: data,
    },
  ], [data]);

  return (
    <div className="max-w-full overflow-x-auto custom-scrollbar">
      <div id="chartPatrimonio" className="min-w-[600px] xl:min-w-full">
        <ApexChartWrapper
          options={options}
          series={series}
          type="area"
          height={335}
        />
      </div>
    </div>
  );
}
