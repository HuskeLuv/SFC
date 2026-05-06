'use client';
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RendaFixaData, RendaFixaSecao, RendaFixaAtivo } from '@/types/rendaFixa';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';

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

  const formatCurrency = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return 'R$ 0,00';
    }
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const formatPercentage = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return '0,00%';
    }
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

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
        console.error('Erro ao atualizar caixa para investir:', err);
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
        console.error('Erro ao atualizar campo:', err);
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
