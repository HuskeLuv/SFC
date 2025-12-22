"use client";
import React, { useEffect, useState, useMemo } from "react";
import { ApexOptions } from "apexcharts";

interface ApexChartWrapperProps {
  options: ApexOptions;
  series: number[];
  type: string;
  width?: string;
  height?: string;
}

const ApexChartWrapper: React.FC<ApexChartWrapperProps> = ({
  options,
  series,
  type,
  width = "100%",
  height = "350",
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [Chart, setChart] = useState<React.ComponentType<any> | null>(null);

  // Criar cópia profunda do objeto options para evitar enumeração de params/searchParams
  // JSON.parse/stringify remove referências a objetos especiais do Next.js como searchParams
  // IMPORTANTE: useMemo deve ser chamado antes de qualquer early return para manter ordem dos hooks
  const sanitizedOptions = useMemo(() => {
    try {
      // Usar JSON para garantir remoção completa de referências a searchParams
      // Isso é necessário porque o ApexCharts pode tentar enumerar propriedades
      // e o Next.js 15 detecta acesso direto a searchParams
      return JSON.parse(JSON.stringify(options)) as ApexOptions;
    } catch (error) {
      console.warn('Erro ao sanitizar opções do gráfico:', error);
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

  const chartProps = {
    options: sanitizedOptions,
    series: [...series],
    type,
    width,
    height,
  };

  return <Chart {...chartProps} />;
};

export default ApexChartWrapper;

