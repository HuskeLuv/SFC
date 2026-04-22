'use client';
import React, { useState } from 'react';
import { GroupedProventoData } from '@/hooks/useProventos';
import ProventosDistribuicaoCards from './ProventosDistribuicaoCards';
import ProventosDistribuicaoTable from './ProventosDistribuicaoTable';

type GroupByType = 'ativo' | 'classe' | 'tipo';

interface ProventosDistribuicaoProps {
  grouped: Record<string, GroupedProventoData>;
  groupBy: GroupByType;
  onGroupByChange: (value: GroupByType) => void;
  periodLabel: string;
}

const GROUP_BY_OPTIONS: Array<{ value: GroupByType; label: string }> = [
  { value: 'ativo', label: 'Ativo' },
  { value: 'classe', label: 'Classe de ativo' },
  { value: 'tipo', label: 'Tipo de provento' },
];

export default function ProventosDistribuicao({
  grouped,
  groupBy,
  onGroupByChange,
  periodLabel,
}: ProventosDistribuicaoProps) {
  const [displayMode, setDisplayMode] = useState<'chart' | 'table'>('chart');

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-white/[0.05] dark:bg-white/[0.03]">
      {/* Header: título + período */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="h-5 w-1 rounded-full bg-brand-500" aria-hidden />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Distribuição</h3>
        </div>
        <p className="mt-1 ml-3 text-sm text-gray-500 dark:text-gray-400">
          Período:{' '}
          <span className="font-medium text-gray-700 dark:text-gray-300">{periodLabel}</span>
        </p>
      </div>

      <div className="h-px w-full bg-gray-200 dark:bg-gray-800" />

      {/* Toggles */}
      <div className="mt-4 mb-6 flex flex-wrap items-center justify-between gap-3">
        {/* Esquerda: Gráfico / Tabela */}
        <div className="inline-flex items-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
          <button
            onClick={() => setDisplayMode('chart')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              displayMode === 'chart'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            Gráfico
          </button>
          <button
            onClick={() => setDisplayMode('table')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              displayMode === 'table'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            Tabela
          </button>
        </div>

        {/* Direita: Agrupar por */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Agrupar por:</span>
          {GROUP_BY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onGroupByChange(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                groupBy === opt.value
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      {displayMode === 'chart' ? (
        <ProventosDistribuicaoCards grouped={grouped} groupBy={groupBy} />
      ) : (
        <ProventosDistribuicaoTable grouped={grouped} groupBy={groupBy} />
      )}
    </div>
  );
}
