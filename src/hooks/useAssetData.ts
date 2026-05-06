import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';

/**
 * Minimal shape that all asset data types share.
 * Used as a constraint for the generic hook's optimistic update logic.
 */
export interface AssetDataShape {
  secoes: Array<{
    ativos: Array<{
      id: string;
      objetivo: number;
      valorAtualizado: number;
      percentualCarteira: number;
      quantoFalta: number;
      necessidadeAporte: number;
    }>;
    totalObjetivo: number;
    totalQuantoFalta: number;
    totalNecessidadeAporte: number;
  }>;
  totalGeral: {
    valorAtualizado: number;
    objetivo: number;
    quantoFalta: number;
    necessidadeAporte: number;
  };
}

export interface UseAssetDataConfig {
  // API paths
  apiPath: string;
  objetivoPath: string;
  valorAtualizadoPath?: string;

  // Display
  label: string;

  // Currency formatting
  currency?: 'BRL' | 'USD';
  locale?: string;

  /**
   * When true, updateObjetivo returns Promise<void> and throws on error.
   * When false (default), it returns Promise<boolean> and catches errors internally.
   */
  throwOnError?: boolean;
}

/** Derive a stable query key from the API path (e.g. "/api/carteira/acoes" → "acoes") */
function assetTypeFromPath(apiPath: string): string {
  const segments = apiPath.replace(/^\/api\/carteira\//, '').split('/');
  return segments[0] || apiPath;
}

export function useAssetData<TData extends AssetDataShape>(config: UseAssetDataConfig) {
  const {
    apiPath,
    objetivoPath,
    valorAtualizadoPath,
    label,
    currency = 'BRL',
    locale = currency === 'BRL' ? 'pt-BR' : 'en-US',
    throwOnError = false,
  } = config;

  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.assets.type(assetTypeFromPath(apiPath));

  const {
    data: data = null,
    isLoading: loading,
    error: queryError,
    refetch: queryRefetch,
  } = useQuery<TData>({
    queryKey,
    queryFn: async ({ signal }) => {
      const response = await fetch(apiPath, {
        method: 'GET',
        credentials: 'include',
        signal,
      });

      if (!response.ok) {
        throw new Error(`Erro ao carregar dados ${label}`);
      }

      return response.json();
    },
  });

  const error = queryError ? (queryError as Error).message : null;

  const formatCurrency = (
    value: number | undefined | null,
    overrideCurrency?: 'BRL' | 'USD',
  ): string => {
    const cur = overrideCurrency ?? currency;
    const loc = cur === 'BRL' ? 'pt-BR' : 'en-US';

    if (value === undefined || value === null || isNaN(value)) {
      return cur === 'BRL' ? 'R$ 0,00' : '$0.00';
    }

    return value.toLocaleString(loc, {
      style: 'currency',
      currency: cur,
    });
  };

  const formatPercentage = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return currency === 'BRL' ? '0,00%' : '0.00%';
    }
    return `${value.toFixed(2)}%`;
  };

  const formatNumber = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return '0';
    }
    return value.toLocaleString(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const performOptimisticObjetivoUpdate = (
    prevData: TData,
    ativoId: string,
    novoObjetivo: number,
  ): TData => {
    const updatedSecoes = prevData.secoes.map((secao) => ({
      ...secao,
      ativos: secao.ativos.map((ativo) =>
        ativo.id === ativoId
          ? {
              ...ativo,
              objetivo: novoObjetivo,
              percentualCarteira:
                prevData.totalGeral.valorAtualizado > 0
                  ? (ativo.valorAtualizado / prevData.totalGeral.valorAtualizado) * 100
                  : ativo.percentualCarteira,
              quantoFalta: (() => {
                const novoPercentualCarteira =
                  prevData.totalGeral.valorAtualizado > 0
                    ? (ativo.valorAtualizado / prevData.totalGeral.valorAtualizado) * 100
                    : ativo.percentualCarteira;
                return novoObjetivo - novoPercentualCarteira;
              })(),
              necessidadeAporte: (() => {
                const novoPercentualCarteira =
                  prevData.totalGeral.valorAtualizado > 0
                    ? (ativo.valorAtualizado / prevData.totalGeral.valorAtualizado) * 100
                    : ativo.percentualCarteira;
                const novoQuantoFalta = novoObjetivo - novoPercentualCarteira;
                return prevData.totalGeral.valorAtualizado > 0 && novoQuantoFalta > 0
                  ? (novoQuantoFalta / 100) * prevData.totalGeral.valorAtualizado
                  : 0;
              })(),
            }
          : ativo,
      ),
    }));

    const secoesComTotais = updatedSecoes.map((secao) => {
      const totalObjetivo = secao.ativos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
      const totalQuantoFalta = secao.ativos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
      const totalNecessidadeAporte = secao.ativos.reduce(
        (sum, ativo) => sum + ativo.necessidadeAporte,
        0,
      );
      return {
        ...secao,
        totalObjetivo,
        totalQuantoFalta,
        totalNecessidadeAporte,
      };
    });

    const totalObjetivo = secoesComTotais.reduce((sum, secao) => sum + secao.totalObjetivo, 0);
    const totalQuantoFalta = secoesComTotais.reduce(
      (sum, secao) => sum + secao.totalQuantoFalta,
      0,
    );
    const totalNecessidadeAporte = secoesComTotais.reduce(
      (sum, secao) => sum + secao.totalNecessidadeAporte,
      0,
    );

    return {
      ...prevData,
      secoes: secoesComTotais,
      totalGeral: {
        ...prevData.totalGeral,
        objetivo: totalObjetivo,
        quantoFalta: totalQuantoFalta,
        necessidadeAporte: totalNecessidadeAporte,
      },
    };
  };

  const objetivoMutation = useMutation({
    mutationFn: async ({ ativoId, novoObjetivo }: { ativoId: string; novoObjetivo: number }) => {
      const response = await csrfFetch(objetivoPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativoId, objetivo: novoObjetivo }),
      });
      if (!response.ok) throw new Error('Erro ao atualizar objetivo');
    },
    onMutate: async ({ ativoId, novoObjetivo }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<TData>(queryKey);
      if (previousData) {
        queryClient.setQueryData<TData>(
          queryKey,
          performOptimisticObjetivoUpdate(previousData, ativoId, novoObjetivo),
        );
      }
      return { previousData };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData<TData>(queryKey, context.previousData);
      }
    },
    // NOTA: objetivo é um target per-asset (não cost basis nem valor atual). Cards
    // de resumo usam alocacao.config (target por categoria), não o objetivo do ativo.
    // Por isso NÃO disparamos invalidatePortfolioDerivedQueries aqui — manter o
    // optimistic update local intacto sem broad refetch.
  });

  const updateObjetivo = async (ativoId: string, novoObjetivo: number): Promise<boolean | void> => {
    if (!data) return throwOnError ? undefined : false;

    try {
      await objetivoMutation.mutateAsync({ ativoId, novoObjetivo });
      if (!throwOnError) return true;
    } catch (err) {
      console.error('Erro ao atualizar objetivo:', err);
      if (throwOnError) throw err;
      return false;
    }
  };

  const updateValorAtualizado = valorAtualizadoPath
    ? async (ativoId: string, novoValor: number) => {
        try {
          const response = await csrfFetch(valorAtualizadoPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ativoId, campo: 'valorAtualizado', valor: novoValor }),
          });
          if (!response.ok) throw new Error('Erro ao atualizar valor');

          await queryClient.invalidateQueries({ queryKey });
          invalidatePortfolioDerivedQueries(queryClient);
          return true;
        } catch (err) {
          console.error('Erro ao atualizar valor:', err);
          return false;
        }
      }
    : undefined;

  const updateCaixaParaInvestir = useCallback(
    async (novoCaixa: number) => {
      try {
        const response = await csrfFetch(apiPath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caixaParaInvestir: novoCaixa }),
        });

        if (!response.ok) throw new Error('Erro ao atualizar caixa para investir');

        await queryClient.invalidateQueries({ queryKey });
        invalidatePortfolioDerivedQueries(queryClient);
        return true;
      } catch (err) {
        console.error('Erro ao atualizar caixa para investir:', err);
        return false;
      }
    },
    [csrfFetch, apiPath, queryClient, queryKey],
  );

  const refetch = useCallback(() => {
    return queryRefetch().then(() => undefined);
  }, [queryRefetch]);

  const fetchData = refetch;

  const setData = useCallback(
    (updater: TData | null | ((prev: TData | null) => TData | null)) => {
      if (typeof updater === 'function') {
        queryClient.setQueryData<TData | null>(queryKey, (old) =>
          (updater as (prev: TData | null) => TData | null)(old ?? null),
        );
      } else {
        queryClient.setQueryData<TData | null>(queryKey, updater);
      }
    },
    [queryClient, queryKey],
  );

  return {
    data,
    loading,
    error,
    refetch,
    setData,
    fetchData,
    csrfFetch,
    updateObjetivo,
    updateValorAtualizado,
    updateCaixaParaInvestir,
    formatCurrency,
    formatPercentage,
    formatNumber,
  };
}
