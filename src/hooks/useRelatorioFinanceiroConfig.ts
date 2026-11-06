'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { RelatorioFinanceiroConfig } from '@/types/relatorioFinanceiro';

/**
 * Chave do Relatório financeiro (GET /api/relatorios/financeiro/config), para o subitem do menu.
 * Erro ou 404 = desligado (menu igual ao de hoje).
 */
export function useRelatorioFinanceiroConfig() {
  return useQuery<RelatorioFinanceiroConfig, Error>({
    queryKey: queryKeys.relatorios.financeiroConfig(),
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/relatorios/financeiro/config', {
        credentials: 'include',
        signal,
      });
      if (!res.ok) return { habilitado: false };
      return (await res.json()) as RelatorioFinanceiroConfig;
    },
  });
}
