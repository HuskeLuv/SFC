'use client';

import React, { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useCashflowYear } from '@/context/CashflowYearContext';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Seletor de ano da planilha de Fluxo de Caixa, renderizado na sidebar sob o
 * item "Fluxo de Caixa" (observação 3 da reunião jun/2026). Muda o ano de
 * referência da planilha; se o usuário não estiver na planilha, navega pra lá.
 *
 * Anos disponíveis são dinâmicos: começam no menor ano com dados do usuário
 * (aporte/resgate ou valor lançado — GET /api/cashflow/anos), com piso
 * `ano atual - 2` como fallback.
 */
const CURRENT_YEAR = new Date().getFullYear();

export default function CashflowYearSelect() {
  const { year, setYear } = useCashflowYear();
  const router = useRouter();
  const pathname = usePathname();

  const { data: anosData } = useQuery({
    queryKey: queryKeys.cashflow.anos(),
    queryFn: async (): Promise<{ minYear: number | null }> => {
      const res = await fetch('/api/cashflow/anos', { credentials: 'include' });
      if (!res.ok) throw new Error('Erro ao buscar anos do fluxo de caixa');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const years = useMemo(() => {
    const firstYear = Math.min(anosData?.minYear ?? CURRENT_YEAR - 2, CURRENT_YEAR - 2);
    const list: number[] = [];
    for (let y = firstYear; y <= CURRENT_YEAR + 8; y++) list.push(y);
    if (!list.includes(year)) list.push(year);
    return list.sort((a, b) => a - b);
  }, [year, anosData?.minYear]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const y = Number(e.target.value);
    setYear(y);
    if (pathname !== '/fluxodecaixa') {
      router.push(`/fluxodecaixa?ano=${y}`);
    }
  };

  return (
    <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span className="shrink-0">Ano</span>
      <select
        value={year}
        onChange={handleChange}
        aria-label="Ano da planilha de fluxo de caixa"
        className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </label>
  );
}
