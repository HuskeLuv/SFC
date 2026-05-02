import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';

export interface CarteiraResumo {
  saldoBruto: number;
  valorAplicado: number;
  rentabilidade: number;
  metaPatrimonio: number;
  caixaParaInvestir: number;
  historicoPatrimonio: Array<{
    data: number;
    valorAplicado: number;
    saldoBruto: number;
  }>;
  historicoTWR?: Array<{ data: number; value: number }>;
  historicoMWR?: Array<{ data: number; value: number }>;
  historicoTWRPeriodo?: Array<{ data: number; value: number }>;
  historicoMWRPeriodo?: Array<{ data: number; value: number }>;
  distribuicao: {
    reservaEmergencia: { valor: number; percentual: number };
    reservaOportunidade: { valor: number; percentual: number };
    rendaFixaFundos: { valor: number; percentual: number };
    fimFia: { valor: number; percentual: number };
    fiis: { valor: number; percentual: number };
    acoes: { valor: number; percentual: number };
    stocks: { valor: number; percentual: number };
    reits: { valor: number; percentual: number };
    etfs: { valor: number; percentual: number };
    moedasCriptos: { valor: number; percentual: number };
    previdenciaSeguros: { valor: number; percentual: number };
    opcoes: { valor: number; percentual: number };
    imoveisBens: { valor: number; percentual: number };
  };
  portfolioDetalhes: {
    totalAcoes: number;
    totalInvestimentos: number;
    stocksTotalInvested: number;
    stocksCurrentValue: number;
    otherInvestmentsTotalInvested: number;
    otherInvestmentsCurrentValue: number;
  };
}

export const useCarteira = () => {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.carteira.resumo();

  const {
    data: resumo = null,
    isLoading: loading,
    error: queryError,
    refetch: queryRefetch,
  } = useQuery<CarteiraResumo>({
    queryKey,
    queryFn: async ({ signal }) => {
      // Progressive loading: fast summary first, then full data with history
      const responseFast = await fetch('/api/carteira/resumo?includeHistorico=false', {
        method: 'GET',
        credentials: 'include',
        signal,
      });

      if (!responseFast.ok) throw new Error('Erro ao carregar dados da carteira');

      const dataFast = await responseFast.json();

      // Set fast data immediately via cache, then fetch full data
      queryClient.setQueryData<CarteiraResumo>(queryKey, dataFast);

      // Background: full data with history
      const responseFull = await fetch('/api/carteira/resumo', {
        method: 'GET',
        credentials: 'include',
        signal,
      });

      if (responseFull.ok) {
        return responseFull.json();
      }

      return dataFast;
    },
  });

  const error = queryError ? (queryError as Error).message : null;

  const updateMeta = useCallback(
    async (novaMetaPatrimonio: number) => {
      try {
        const response = await csrfFetch('/api/carteira/resumo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metaPatrimonio: novaMetaPatrimonio }),
        });

        if (!response.ok) throw new Error('Erro ao atualizar meta de patrimônio');

        await queryClient.invalidateQueries({ queryKey });
        return true;
      } catch (err) {
        console.error('Erro ao atualizar meta:', err);
        return false;
      }
    },
    [csrfFetch, queryClient, queryKey],
  );

  const updateCaixaParaInvestir = useCallback(
    async (novoCaixa: number) => {
      if (!resumo) return false;

      const previousResumo = resumo;

      // Optimistic update
      queryClient.setQueryData<CarteiraResumo>(queryKey, {
        ...resumo,
        caixaParaInvestir: novoCaixa,
      });

      try {
        const response = await csrfFetch('/api/carteira/resumo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caixaParaInvestir: novoCaixa }),
        });

        if (!response.ok) throw new Error('Erro ao atualizar caixa para investir');

        return true;
      } catch (err) {
        // Rollback
        queryClient.setQueryData<CarteiraResumo>(queryKey, previousResumo);
        console.error('Erro ao atualizar caixa para investir:', err);
        return false;
      }
    },
    [resumo, csrfFetch, queryClient, queryKey],
  );

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

  const refetch = useCallback(() => {
    return queryRefetch().then(() => undefined);
  }, [queryRefetch]);

  return {
    resumo,
    loading,
    error,
    refetch,
    updateMeta,
    updateCaixaParaInvestir,
    formatCurrency,
    formatPercentage,
  };
};
