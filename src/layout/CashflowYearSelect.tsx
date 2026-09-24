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

export default function CashflowYearSelect({ compact = false }: { compact?: boolean } = {}) {
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

  const options = years.map((y) => (
    <option key={y} value={y}>
      {y}
    </option>
  ));

  // Versão compacta do cabeçalho mobile (PWA fase 0): <select> nativo de 36px visíveis dentro
  // de um alvo de 44px, fonte de 16px (sem zoom no iOS). A versão da sidebar não muda.
  if (compact) {
    return (
      <label className="relative inline-flex min-h-11 shrink-0 items-center">
        <select
          value={year}
          onChange={handleChange}
          aria-label="Ano da planilha de fluxo de caixa"
          className="h-9 appearance-none rounded-xl border border-gray-200 bg-white pr-8 pl-3 text-base font-medium text-gray-800 tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mf-outside dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          {options}
        </select>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 text-gray-500 dark:text-gray-400"
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </label>
    );
  }

  return (
    <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span className="shrink-0">Ano</span>
      <select
        value={year}
        onChange={handleChange}
        aria-label="Ano da planilha de fluxo de caixa"
        className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
      >
        {options}
      </select>
    </label>
  );
}
