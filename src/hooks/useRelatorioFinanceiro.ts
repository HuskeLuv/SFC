'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { MesesRelatorio, RelatorioFinanceiro } from '@/types/relatorioFinanceiro';

/**
 * Relatório financeiro (GET /api/relatorios/financeiro?meses=N), um cache por período.
 *
 * Sempre refaz ao abrir (staleTime 0 + refetchOnMount 'always'): edições de fluxo, dívidas e
 * sonhos aparecem na próxima abertura; o servidor absorve a repetição com o cache de insumos de
 * 60 s. Ao trocar de período, o relatório anterior fica na tela até o novo chegar
 * (keepPreviousData).
 */
export function useRelatorioFinanceiro(
  meses: MesesRelatorio,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery<RelatorioFinanceiro, Error>({
    queryKey: queryKeys.relatorios.financeiro(meses),
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/relatorios/financeiro?meses=${meses}`, {
        credentials: 'include',
        signal,
      });
      if (!res.ok) {
        throw new Error(
          res.status === 404 ? 'Relatório indisponível' : 'Erro ao gerar o relatório financeiro',
        );
      }
      return (await res.json()) as RelatorioFinanceiro;
    },
  });
}
