'use client';

import React, { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useCashflowYear } from '@/context/CashflowYearContext';

/**
 * Seletor de ano da planilha de Fluxo de Caixa, renderizado na sidebar sob o
 * item "Fluxo de Caixa" (observação 3 da reunião jun/2026). Muda o ano de
 * referência da planilha; se o usuário não estiver na planilha, navega pra lá.
 */
const CURRENT_YEAR = new Date().getFullYear();

export default function CashflowYearSelect() {
  const { year, setYear } = useCashflowYear();
  const router = useRouter();
  const pathname = usePathname();

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = CURRENT_YEAR - 2; y <= CURRENT_YEAR + 8; y++) list.push(y);
    if (!list.includes(year)) list.push(year);
    return list.sort((a, b) => a - b);
  }, [year]);

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
