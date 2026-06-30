'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Ano de referência da planilha de Fluxo de Caixa (observações 2/3 da reunião
 * jun/2026). Escopo: SÓ o fluxo de caixa — Sonhos/Planejamento seguem usando
 * startDate+prazo próprios.
 *
 * O seletor vive na sidebar e a planilha (DataTableTwo) consome este context,
 * por isso o estado é compartilhado num provider de layout em vez de URL +
 * useSearchParams (que exigiria Suspense). O ano é espelhado em `?ano=` via
 * replaceState pra deep-link/refresh preservarem a seleção.
 */

const CURRENT_YEAR = new Date().getFullYear();

function isValidYear(y: number): boolean {
  return Number.isInteger(y) && y >= 2000 && y <= 2100;
}

function parseYearFromUrl(): number {
  if (typeof window === 'undefined') return CURRENT_YEAR;
  const raw = new URLSearchParams(window.location.search).get('ano');
  const y = Number(raw);
  return isValidYear(y) ? y : CURRENT_YEAR;
}

interface CashflowYearContextValue {
  year: number;
  setYear: (y: number) => void;
}

const CashflowYearContext = createContext<CashflowYearContextValue | null>(null);

export function CashflowYearProvider({ children }: { children: React.ReactNode }) {
  const [year, setYearState] = useState<number>(CURRENT_YEAR);

  // Lê o ano da URL só no client após a montagem (evita mismatch de hidratação).
  useEffect(() => {
    const fromUrl = parseYearFromUrl();
    if (fromUrl !== CURRENT_YEAR) setYearState(fromUrl);
  }, []);

  const setYear = useCallback((y: number) => {
    if (!isValidYear(y)) return;
    setYearState(y);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (y === CURRENT_YEAR) url.searchParams.delete('ano');
      else url.searchParams.set('ano', String(y));
      window.history.replaceState(null, '', url.toString());
    }
  }, []);

  const value = useMemo(() => ({ year, setYear }), [year, setYear]);

  return <CashflowYearContext.Provider value={value}>{children}</CashflowYearContext.Provider>;
}

export function useCashflowYear(): CashflowYearContextValue {
  const ctx = useContext(CashflowYearContext);
  if (!ctx) {
    throw new Error('useCashflowYear deve ser usado dentro de CashflowYearProvider');
  }
  return ctx;
}
