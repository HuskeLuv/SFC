'use client';
import React, { useMemo } from 'react';
import { GroupedProventoData } from '@/hooks/useProventos';

interface ProventosDistribuicaoCardsProps {
  grouped: Record<string, GroupedProventoData>;
  groupBy: 'ativo' | 'classe' | 'tipo';
}

// Paleta da marca (mesma usada no restante da seção) em degradê
const CARD_COLORS = [
  'bg-brand-600',
  'bg-brand-500',
  'bg-brand-400',
  'bg-[#8B5CF6]',
  'bg-[#6366F1]',
  'bg-[#06B6D4]',
  'bg-[#10B981]',
  'bg-[#F59E0B]',
  'bg-[#EF4444]',
  'bg-[#EC4899]',
];

const formatCurrency = (value: number) =>
  `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const buildTitle = (
  key: string,
  data: GroupedProventoData,
  groupBy: 'ativo' | 'classe' | 'tipo',
) => {
  if (groupBy !== 'ativo') return key;
  const symbol = data.items[0]?.symbol;
  if (!symbol) return key;
  // key já é o "ativo" (name). Se o símbolo for diferente, exibe "SYMBOL - NOME"
  return symbol === key ? key : `${symbol} - ${key}`;
};

export default function ProventosDistribuicaoCards({
  grouped,
  groupBy,
}: ProventosDistribuicaoCardsProps) {
  const { entries, total } = useMemo(() => {
    const items = Object.entries(grouped).sort((a, b) => b[1].total - a[1].total);
    const sum = items.reduce((s, [, d]) => s + d.total, 0);
    return { entries: items, total: sum };
  }, [grouped]);

  if (entries.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        Nenhum provento encontrado no período selecionado
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {entries.map(([key, data], idx) => {
        const percentage = total > 0 ? (data.total / total) * 100 : 0;
        const color = CARD_COLORS[idx % CARD_COLORS.length];
        const title = buildTitle(key, data, groupBy);

        return (
          <div
            key={key}
            className={`rounded-2xl ${color} p-5 text-white min-h-[160px] flex flex-col justify-between`}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-90">{title}</p>
              <p className="mt-2 text-3xl font-bold">{percentage.toFixed(2)}%</p>
            </div>
            <div className="mt-4">
              <p className="text-xs opacity-90">Total acumulado:</p>
              <p className="text-lg font-bold">{formatCurrency(data.total)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
