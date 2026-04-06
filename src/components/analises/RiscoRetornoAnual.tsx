'use client';
import React, { useState } from 'react';
import { ChevronLeftIcon } from '@/icons';
import GaugeChart from '@/components/charts/GaugeChart';

interface RiscoRetornoMetrics {
  retornoAnual: number;
  retornoCDI: number;
  volatilidade: number;
  sharpe: number;
}

interface RiscoRetornoAnualProps {
  data: Record<number, RiscoRetornoMetrics>;
  anosDisponiveis: number[];
}

function sharpeToGauge(sharpe: number): number {
  return Math.max(0, Math.min(100, ((sharpe + 1) / 4) * 100));
}

function gaugeColor(sharpe: number): string {
  if (sharpe >= 1) return '#10B981';
  if (sharpe >= 0) return '#465FFF';
  return '#EF4444';
}

const emptyMetrics: RiscoRetornoMetrics = {
  retornoAnual: 0,
  retornoCDI: 0,
  volatilidade: 0,
  sharpe: 0,
};

export default function RiscoRetornoAnual({ data, anosDisponiveis }: RiscoRetornoAnualProps) {
  const [anoIndex, setAnoIndex] = useState(0);
  const anoSelecionado = anosDisponiveis[anoIndex] ?? new Date().getFullYear();
  const metrics = data[anoSelecionado] ?? emptyMetrics;

  const handlePrev = () => {
    setAnoIndex((prev) => Math.min(prev + 1, anosDisponiveis.length - 1));
  };

  const handleNext = () => {
    setAnoIndex((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      {/* Header with title + year selector */}
      <div className="flex items-center justify-between px-6 py-5">
        <h3 className="text-base font-medium text-gray-800 dark:text-white/90">Anual</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrev}
            disabled={anoIndex >= anosDisponiveis.length - 1}
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <span className="min-w-[3rem] text-center text-sm font-semibold text-gray-800 dark:text-white/90">
            {anoSelecionado}
          </span>
          <button
            onClick={handleNext}
            disabled={anoIndex <= 0}
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <ChevronLeftIcon className="h-4 w-4 rotate-180" />
          </button>
        </div>
      </div>

      <div className="border-t border-gray-100 dark:border-gray-800 p-4 sm:p-6">
        <div className="space-y-6">
          {/* Gauge Chart */}
          <div className="flex justify-center w-full">
            <div className="relative w-full max-w-md">
              <GaugeChart
                value={sharpeToGauge(metrics.sharpe)}
                color={gaugeColor(metrics.sharpe)}
                height={240}
              />
              {/* Center overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center translate-y-[10%] pointer-events-none">
                <svg
                  className="mb-1 text-gray-500 dark:text-gray-400"
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                  <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                  <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Carteira
                </span>
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-sm text-gray-500 dark:text-gray-400">RETORNO ANUAL</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {metrics.retornoAnual.toFixed(2)}%
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-500 dark:text-gray-400">VOLATILIDADE</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {metrics.volatilidade.toFixed(2)}%
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-500 dark:text-gray-400">RETORNO CDI</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {metrics.retornoCDI.toFixed(2)}%
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-500 dark:text-gray-400">ÍNDICE SHARPE</div>
              <div className="text-2xl font-bold text-[#465FFF]">{metrics.sharpe.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
