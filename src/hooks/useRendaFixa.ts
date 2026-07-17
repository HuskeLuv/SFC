'use client';

import { logger } from '@/lib/logger';
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RendaFixaData, RendaFixaSecao, RendaFixaAtivo } from '@/types/rendaFixa';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';
import { formatBRL, formatPctSigned } from '@/utils/format';

export const useRendaFixa = () => {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.assets.type('renda-fixa');

  const {
    data = null,
    isLoading: loading,
    error: queryError,
    refetch: queryRefetch,
  } = useQuery<RendaFixaData>({
    queryKey,
    queryFn: async () => {
      const response = await fetch('/api/carteira/renda-fixa', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar dados Renda Fixa');
      }

      const responseData = await response.json();

      if (responseData.secoes) {
        responseData.secoes = responseData.secoes.map((secao: RendaFixaSecao) => ({
          ...secao,
          ativos: secao.ativos.map((ativo: RendaFixaAtivo & { vencimento: Date | string }) => ({
            ...ativo,
            vencimento: ativo.vencimento ? new Date(ativo.vencimento) : new Date(),
          })),
        }));
      }

      return responseData as RendaFixaData;
    },
  });

  const formatCurrency = (value: number | undefined | null): string => formatBRL(value);

  // Comportamento com sinal preservado: os consumidores em RendaFixaTable são
  // majoritariamente deltas (rentabilidade, rentabilidade média).
  // TODO(auditoria 2.9): a coluna "Risco por ativo" (RendaFixaTable:236) NÃO é
  // delta e não deveria ganhar "+" — quando aquele arquivo for liberado, trocar
  // aquele call site para formatPct.
  const formatPercentage = (value: number | undefined | null): string => formatPctSigned(value);

  const updateCaixaParaInvestir = useCallback(
    async (novoCaixa: number) => {
      try {
        const response = await csrfFetch('/api/carteira/renda-fixa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caixaParaInvestir: novoCaixa }),
        });

        if (!response.ok) {
          throw new Error('Erro ao atualizar caixa para investir');
        }

        await queryClient.invalidateQueries({ queryKey });
        invalidatePortfolioDerivedQueries(queryClient);
        return true;
      } catch (err) {
        logger.error('Erro ao atualizar caixa para investir:', err);
        return false;
      }
    },
    [csrfFetch, queryClient, queryKey],
  );

  const updateRendaFixaCampo = useCallback(
    async (
      portfolioId: string,
      campo:
        | 'cotizacaoResgate'
        | 'liquidacaoResgate'
        | 'benchmark'
        | 'valorAtualizado'
        | 'observacoes',
      valor: string | number,
    ) => {
      try {
        const response = await csrfFetch('/api/carteira/renda-fixa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ativoId: portfolioId, campo, valor }),
        });

        if (!response.ok) {
          throw new Error('Erro ao atualizar campo');
        }

        await queryClient.invalidateQueries({ queryKey });
        invalidatePortfolioDerivedQueries(queryClient);
        return true;
      } catch (err) {
        logger.error('Erro ao atualizar campo:', err);
        return false;
      }
    },
    [csrfFetch, queryClient, queryKey],
  );

  return {
    data,
    loading,
    error: queryError ? (queryError as Error).message : null,
    refetch: () => void queryRefetch(),
    updateCaixaParaInvestir,
    updateRendaFixaCampo,
    formatCurrency,
    formatPercentage,
  };
};
