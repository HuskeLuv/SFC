'use client';
import React from 'react';
import ComponentCard from '@/components/common/ComponentCard';
import GaugeChart from '@/components/charts/GaugeChart';

interface RiscoRetornoMetrics {
  retornoAnual: number;
  retornoCDI: number;
  volatilidade: number;
  sharpe: number;
}

interface RiscoRetornoCarteiraProps {
  data: RiscoRetornoMetrics;
}

/** Converte Sharpe em porcentagem para o gauge (clamped 0-100). */
function sharpeToGauge(sharpe: number): number {
  // Escala: Sharpe -1 a 3 → 0% a 100%
  return Math.max(0, Math.min(100, ((sharpe + 1) / 4) * 100));
}

function gaugeColor(sharpe: number): string {
  if (sharpe >= 1) return '#10B981';
  if (sharpe >= 0) return '#465FFF';
  return '#EF4444';
}

export default function RiscoRetornoCarteira({ data }: RiscoRetornoCarteiraProps) {
  return (
    <ComponentCard title="Carteira" desc="">
      <div className="space-y-6">
        {/* Gauge Chart */}
        <div className="flex justify-center w-full">
          <div className="relative w-full max-w-md">
            <GaugeChart
              value={sharpeToGauge(data.sharpe)}
              color={gaugeColor(data.sharpe)}
              height={240}
            />
            {/* Center overlay: wallet icon + label */}
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
              {data.retornoAnual.toFixed(2)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-500 dark:text-gray-400">VOLATILIDADE</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {data.volatilidade.toFixed(2)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-500 dark:text-gray-400">RETORNO CDI</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {data.retornoCDI.toFixed(2)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-500 dark:text-gray-400">ÍNDICE SHARPE</div>
            <div className="text-2xl font-bold text-[#465FFF]">{data.sharpe.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </ComponentCard>
  );
}
