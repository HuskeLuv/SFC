"use client";
import React, { useMemo } from "react";
import { ApexOptions } from "apexcharts";
import ApexChartWrapper from "../ApexChartWrapper";

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
          formatter: (_val, opts) => {
            const seriesValue = opts?.series?.[opts.seriesIndex] ?? 0;
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
    Number(distribuicao.reservaOportunidade.percentual.toFixed(2)),
    Number(distribuicao.rendaFixaFundos.percentual.toFixed(2)),
    Number(distribuicao.fimFia.percentual.toFixed(2)),
    Number(distribuicao.fiis.percentual.toFixed(2)),
    Number(distribuicao.acoes.percentual.toFixed(2)),
    Number(distribuicao.stocks.percentual.toFixed(2)),
    Number(distribuicao.reits.percentual.toFixed(2)),
    Number(distribuicao.etfs.percentual.toFixed(2)),
    Number(distribuicao.moedasCriptos.percentual.toFixed(2)),
    Number(distribuicao.previdenciaSeguros.percentual.toFixed(2)),
    Number(distribuicao.opcoes.percentual.toFixed(2)),
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