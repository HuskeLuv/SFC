"use client";
import React, { useMemo, useEffect, useState } from "react";
import { ApexOptions } from "apexcharts";

// Componente wrapper para o ReactApexChart
const ApexChartWrapper = React.memo(({ options, series, type, width, height }: {
  options: ApexOptions;
  series: number[];
  type: string;
  width: string;
  height: string;
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [Chart, setChart] = useState<React.ComponentType<any> | null>(null);

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

  return <Chart options={options} series={series} type={type} width={width} height={height} />;
});

ApexChartWrapper.displayName = 'ApexChartWrapper';

interface PieChartCarteiraInvestimentosProps {
  distribuicao: {
    reservaOportunidade: {
      valor: number;
      percentual: number;
    };
    rendaFixaFundos: {
      valor: number;
      percentual: number;
    };
    fimFia: {
      valor: number;
      percentual: number;
    };
    fiis: {
      valor: number;
      percentual: number;
    };
    acoes: {
      valor: number;
      percentual: number;
    };
    stocks: {
      valor: number;
      percentual: number;
    };
    reits: {
      valor: number;
      percentual: number;
    };
    etfs: {
      valor: number;
      percentual: number;
    };
    moedasCriptos: {
      valor: number;
      percentual: number;
    };
    previdenciaSeguros: {
      valor: number;
      percentual: number;
    };
    opcoes: {
      valor: number;
      percentual: number;
    };
  };
}

export default function PieChartCarteiraInvestimentos({ distribuicao }: PieChartCarteiraInvestimentosProps) {
  // Mocked dark mode state (replace with actual context/state if applicable)
  const isDarkMode = true; // Change this to your dark mode logic

  // Chart configuration - memoized to prevent unnecessary re-renders
  const options: ApexOptions = useMemo(
    () => ({
      colors: [
        "#BFDBFE", // Reserva de Oportunidade - Azul pastel
        "#A7F3D0", // Renda Fixa & Fundos - Verde pastel
        "#DDD6FE", // FIM/FIA - Roxo pastel
        "#FECACA", // FII's - Vermelho pastel
        "#93C5FD", // Ações - Azul claro pastel
        "#BBF7D0", // Stocks - Verde menta pastel
        "#E9D5FF", // REIT's - Lilás pastel
        "#FED7AA", // ETF's - Laranja pastel
        "#FEF3C7", // Moedas/Criptos - Amarelo pastel
        "#D1D5DB", // Previdência - Cinza pastel
        "#FBBF24", // Opções - Dourado pastel
      ],
      labels: [
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
        "Opções"
      ],
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
                formatter: () => {
                  const total = Object.values(distribuicao).reduce((sum, item) => sum + item.valor, 0);
                  return `R$ ${total.toLocaleString('pt-BR')}`;
                },
              },
              total: {
                show: true,
                label: "Total Aplicado",
                color: isDarkMode ? "#ffffff" : "#000000",
                fontSize: "16px",
                fontWeight: "bold",
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
            formatter: (val: number) => {
              const total = Object.values(distribuicao).reduce((sum, item) => sum + item.valor, 0);
              const valor = (val / 100) * total;
              return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
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
    [isDarkMode, distribuicao]
  );

  const series = useMemo(() => [
    Math.round(distribuicao.reservaOportunidade.percentual * 100) / 100,
    Math.round(distribuicao.rendaFixaFundos.percentual * 100) / 100,
    Math.round(distribuicao.fimFia.percentual * 100) / 100,
    Math.round(distribuicao.fiis.percentual * 100) / 100,
    Math.round(distribuicao.acoes.percentual * 100) / 100,
    Math.round(distribuicao.stocks.percentual * 100) / 100,
    Math.round(distribuicao.reits.percentual * 100) / 100,
    Math.round(distribuicao.etfs.percentual * 100) / 100,
    Math.round(distribuicao.moedasCriptos.percentual * 100) / 100,
    Math.round(distribuicao.previdenciaSeguros.percentual * 100) / 100,
    Math.round(distribuicao.opcoes.percentual * 100) / 100,
  ], [distribuicao]);

  return (
    <div className="chart-container">
      <div className="mx-auto">
        <ApexChartWrapper
          options={options}
          series={series}
          type="donut"
          width="100%"
          height="450"
        />
      </div>
    </div>
  );
} 