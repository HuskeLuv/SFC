'use client';
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImovelBemData } from '@/types/imoveis-bens';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';

interface UseImoveisBensReturn {
  data: ImovelBemData | null;
  loading: boolean;
  error: string | null;
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  updateValorAtualizado: (ativoId: string, novoValor: number) => Promise<void>;
  refetch: () => void;
}

export const useImoveisBens = (): UseImoveisBensReturn => {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.assets.type('imoveis-bens');

  const {
    data = null,
    isLoading: loading,
    error: queryError,
  } = useQuery<ImovelBemData>({
    queryKey,
    queryFn: async () => {
      const response = await fetch('/api/carteira/imoveis-bens');

      if (!response.ok) {
        throw new Error('Erro ao carregar dados de imóveis e bens');
      }

      return response.json();
    },
  });

  const formatCurrency = (value: number, currency: 'BRL' | 'USD' = 'BRL'): string => {
    const formatter = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return formatter.format(value);
  };

  const formatPercentage = (value: number): string => {
    return `${value.toFixed(2)}%`;
  };

  const formatNumber = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const updateValorAtualizado = async (ativoId: string, novoValor: number): Promise<void> => {
    try {
      const response = await csrfFetch('/api/carteira/imoveis-bens/valor-atualizado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolioId: ativoId, novoValor }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao atualizar valor atualizado');
      }

      await queryClient.invalidateQueries({ queryKey });
      invalidatePortfolioDerivedQueries(queryClient);
    } catch (err) {
      console.error('Erro ao atualizar valor atualizado:', err);
      throw err;
    }
  };

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  return {
    data,
    loading,
    error: queryError ? (queryError as Error).message : null,
    formatCurrency,
    formatPercentage,
    formatNumber,
    updateValorAtualizado,
    refetch,
  };
};
