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
  // NOTA: Funções (como formatters) não podem ser serializadas em JSON, então precisamos preservá-las
  const sanitizedOptions = useMemo(() => {
    try {
      // Função auxiliar para fazer deep clone preservando funções
      const deepClonePreservingFunctions = (obj: any, visited = new WeakMap()): any => {
        if (obj === null || typeof obj !== 'object') {
          return obj;
        }
        
        // Se já visitamos este objeto, retornar a referência
        if (visited.has(obj)) {
          return visited.get(obj);
        }
        
        // Se for uma função, retornar como está
        if (typeof obj === 'function') {
          return obj;
        }
        
        // Se for uma data, retornar como está
        if (obj instanceof Date) {
          return obj;
        }
        
        // Se for array, clonar recursivamente
        if (Array.isArray(obj)) {
          const cloned = obj.map(item => deepClonePreservingFunctions(item, visited));
          visited.set(obj, cloned);
          return cloned;
        }
        
        // Se for objeto, clonar recursivamente
        const cloned: any = {};
        visited.set(obj, cloned);
        
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            // Preservar funções e fazer deep clone de objetos
            if (typeof value === 'function') {
              cloned[key] = value;
            } else {
              cloned[key] = deepClonePreservingFunctions(value, visited);
            }
          }
        }
        
        return cloned;
      };
      
      return deepClonePreservingFunctions(options) as ApexOptions;
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

