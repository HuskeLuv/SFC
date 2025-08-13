"use client";
import React, { useState } from "react";
import { ApexOptions } from "apexcharts";
import ChartTab from "../common/ChartTab";
import dynamic from "next/dynamic";
import { useStocks } from "@/hooks/useStocks";
import TransactionModal from "./TransactionModal";

// Dynamically import the ReactApexChart component
const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

export default function PortfolioPerformance() {
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const { portfolio, getPortfolioStats } = useStocks();
  const stats = getPortfolioStats();

  // Dados simulados para o gráfico (em produção, você buscaria dados históricos reais)
  const chartData = [
    [1746153600000, stats.totalInvested * 0.95],
    [1746240000000, stats.totalInvested * 0.97],
    [1746326400000, stats.totalInvested * 0.96],
    [1746412800000, stats.totalInvested * 0.98],
    [1746672000000, stats.totalInvested * 1.00],
    [1746758400000, stats.totalInvested * 1.02],
    [1746844800000, stats.totalInvested * 1.01],
    [1746931200000, stats.totalInvested * 1.03],
    [1747017600000, stats.totalInvested * 1.05],
    [1747276800000, stats.totalInvested * 1.04],
    [1747363200000, stats.totalInvested * 1.06],
    [1747449600000, stats.totalInvested * 1.08],
    [1747536000000, stats.totalInvested * 1.07],
    [1747622400000, stats.totalInvested * 1.09],
    [1747881600000, stats.totalInvested * 1.10],
    [1747968000000, stats.totalInvested * 1.12],
    [1748054400000, stats.totalInvested * 1.11],
    [1748140800000, stats.totalInvested * 1.13],
    [1748227200000, stats.totalInvested * 1.15],
    [1748572800000, stats.totalInvested * 1.14],
    [1748659200000, stats.totalInvested * 1.16],
    [1748745600000, stats.totalInvested * 1.18],
    [1748832000000, stats.totalInvested * 1.17],
    [1749091200000, stats.totalInvested * 1.19],
    [1749177600000, stats.totalInvested * 1.21],
    [1749264000000, stats.totalInvested * 1.20],
    [1749350400000, stats.totalInvested * 1.22],
    [1749436800000, stats.totalInvested * 1.24],
    [1749696000000, stats.totalInvested * 1.23],
    [1749782400000, stats.totalInvested * 1.25],
    [1749868800000, stats.totalInvested * 1.27],
    [1749955200000, stats.totalInvested * 1.26],
    [1750041600000, stats.totalInvested * 1.28],
    [1750300800000, stats.totalInvested * 1.30],
    [1750387200000, stats.totalInvested * 1.29],
    [1750473600000, stats.totalInvested * 1.31],
    [1750560000000, stats.totalInvested * 1.33],
    [1750646400000, stats.totalInvested * 1.32],
    [1750905600000, stats.totalInvested * 1.34],
    [1750992000000, stats.totalInvested * 1.36],
    [1751078400000, stats.totalInvested * 1.35],
    [1751164800000, stats.totalInvested * 1.37],
    [1751251200000, stats.totalInvested * 1.39],
    [1751506800000, stats.totalInvested * 1.38],
    [1751593200000, stats.totalInvested * 1.40],
    [1751679600000, stats.totalInvested * 1.42],
    [1751766000000, stats.totalInvested * 1.41],
    [1751852400000, stats.totalInvested * 1.43],
    [1752111600000, stats.totalInvested * 1.45],
    [1752198000000, stats.totalInvested * 1.44],
    [1752284400000, stats.totalInvested * 1.46],
    [1752370800000, stats.totalInvested * 1.48],
    [1752716400000, stats.totalInvested * 1.47],
    [1752802800000, stats.totalInvested * 1.49],
    [1752889200000, stats.totalInvested * 1.51],
    [1752975600000, stats.totalInvested * 1.50],
    [1753062000000, stats.totalInvested * 1.52],
    [1753321200000, stats.totalInvested * 1.54],
    [1753407600000, stats.totalInvested * 1.53],
    [1753494000000, stats.totalInvested * 1.55],
    [1753580400000, stats.totalInvested * 1.57],
    [1753666800000, stats.totalInvested * 1.56],
    [1753926000000, stats.totalInvested * 1.58],
    [1754012400000, stats.totalInvested * 1.60],
    [1754098800000, stats.totalInvested * 1.59],
    [1754185200000, stats.totalInvested * 1.61],
    [1754271600000, stats.totalInvested * 1.63],
    [1754530800000, stats.totalInvested * 1.62],
    [1754617200000, stats.totalInvested * 1.64],
    [1754703600000, stats.totalInvested * 1.66],
    [1754790000000, stats.totalInvested * 1.65],
    [1754876400000, stats.totalInvested * 1.67],
    [1755135600000, stats.totalInvested * 1.69],
    [1755222000000, stats.totalInvested * 1.68],
    [1755308400000, stats.totalInvested * 1.70],
    [1755394800000, stats.totalInvested * 1.72],
    [1755481200000, stats.totalInvested * 1.71],
    [1755740400000, stats.totalInvested * 1.73],
    [1755826800000, stats.totalInvested * 1.75],
    [1755913200000, stats.totalInvested * 1.74],
    [1755999600000, stats.totalInvested * 1.76],
    [1756086000000, stats.totalInvested * 1.78],
    [1756345200000, stats.totalInvested * 1.77],
    [1756431600000, stats.totalInvested * 1.79],
    [1756518000000, stats.totalInvested * 1.81],
    [1756604400000, stats.totalInvested * 1.80],
  ];

  const chartOptions: ApexOptions = {
    chart: {
      type: "area",
      height: 350,
      toolbar: {
        show: false,
      },
      zoom: {
        enabled: false,
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      curve: "smooth",
      width: 2,
    },
    colors: ["#3B82F6"],
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.7,
        opacityTo: 0.1,
        stops: [0, 90, 100],
      },
    },
    xaxis: {
      type: "datetime",
      labels: {
        style: {
          colors: "#9CA3AF",
          fontSize: "12px",
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: "#9CA3AF",
          fontSize: "12px",
        },
        formatter: function (value) {
          return `R$ ${value.toFixed(0)}`;
        },
      },
    },
    grid: {
      borderColor: "#E5E7EB",
      strokeDashArray: 5,
    },
    tooltip: {
      x: {
        format: "dd MMM yyyy",
      },
      y: {
        formatter: function (value) {
          return `R$ ${value.toFixed(2)}`;
        },
      },
    },
  };

  const series = [
    {
      name: "Valor do Portfolio",
      data: chartData,
    },
  ];

  return (
    <>
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Performance do Portfolio
            </h3>
            <button
              onClick={() => setShowTransactionModal(true)}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              + Transação
            </button>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Acompanhe a evolução do seu portfolio ao longo do tempo
          </p>
        </div>

        {/* Estatísticas do Portfolio */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Investido</div>
            <div className="text-lg font-semibold text-gray-800 dark:text-white">
              R$ {stats.totalInvested.toFixed(2)}
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-500 dark:text-gray-400">Valor Atual</div>
            <div className="text-lg font-semibold text-gray-800 dark:text-white">
              R$ {stats.currentValue.toFixed(2)}
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-500 dark:text-gray-400">Retorno Total</div>
            <div className={`text-lg font-semibold ${
              stats.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              R$ {stats.totalReturn.toFixed(2)}
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-500 dark:text-gray-400">Retorno %</div>
            <div className={`text-lg font-semibold ${
              stats.returnPercent >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {stats.returnPercent.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Gráfico */}
        <div className="mb-6">
          <ChartTab
            tabs={[
              {
                label: "1M",
                value: "1m",
              },
              {
                label: "3M",
                value: "3m",
              },
              {
                label: "6M",
                value: "6m",
              },
              {
                label: "1A",
                value: "1y",
              },
              {
                label: "Tudo",
                value: "all",
              },
            ]}
            activeTab="all"
            onTabChange={() => {}}
          />
        </div>

        <div className="h-[350px]">
          <ReactApexChart
            options={chartOptions}
            series={series}
            type="area"
            height={350}
          />
        </div>

        {/* Resumo do Portfolio */}
        {portfolio.length > 0 && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <h4 className="font-medium text-gray-800 dark:text-white mb-2">
              Resumo do Portfolio
            </h4>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <div>Total de ativos: {portfolio.length}</div>
              <div>Quantidade total: {stats.totalQuantity}</div>
              {stats.totalInvested > 0 && (
                <div>
                  Preço médio: R$ {(stats.totalInvested / stats.totalQuantity).toFixed(2)}
                </div>
              )}
            </div>
          </div>
        )}

        {portfolio.length === 0 && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
            <div className="text-gray-500 dark:text-gray-400">
              Nenhum ativo no portfolio ainda
            </div>
            <div className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Registre suas primeiras compras para começar a acompanhar a performance
            </div>
            <button
              onClick={() => setShowTransactionModal(true)}
              className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Registrar Primeira Compra
            </button>
          </div>
        )}
      </div>

      <TransactionModal
        isOpen={showTransactionModal}
        onClose={() => setShowTransactionModal(false)}
      />
    </>
  );
}
