import { useState, useEffect, useRef, useCallback } from 'react';
import { useCsrf } from '@/hooks/useCsrf';

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
  cotacaoPath?: string;
  valorAtualizadoPath?: string;

  // Display
  label: string;

  // Currency formatting
  currency?: 'BRL' | 'USD';
  locale?: string;

  /**
   * When true, updateObjetivo / updateCotacao return Promise<void> and throw on error.
   * When false (default), they return Promise<boolean> and catch errors internally.
   */
  throwOnError?: boolean;
}

export function useAssetData<TData extends AssetDataShape>(config: UseAssetDataConfig) {
  const {
    apiPath,
    objetivoPath,
    cotacaoPath,
    valorAtualizadoPath,
    label,
    currency = 'BRL',
    locale = currency === 'BRL' ? 'pt-BR' : 'en-US',
    throwOnError = false,
  } = config;

  const { csrfFetch } = useCsrf();
  const [data, setData] = useState<TData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);
  const hasFetchedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  // Prevenir refetch desnecessario: so busca dados uma vez na montagem inicial
  // ou quando explicitamente forcado (ex: apos atualizacao de dados)
  const fetchData = useCallback(
    async (force = false) => {
      // Prevenir multiplas chamadas simultaneas
      if (isFetchingRef.current) {
        return;
      }

      // Se ja foi feito fetch e nao e forcado, nao fazer nada
      // Isso evita refetch quando componente remonta ou usuario volta para aba
      if (!force && hasFetchedRef.current) {
        return;
      }

      // Cancel any in-flight request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        isFetchingRef.current = true;
        setLoading(true);
        setError(null);

        const response = await fetch(apiPath, {
          method: 'GET',
          credentials: 'include',
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (!response.ok) {
          throw new Error(`Erro ao carregar dados ${label}`);
        }

        const responseData = await response.json();
        if (controller.signal.aborted) return;
        setData(responseData);
        hasFetchedRef.current = true;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error(`Erro ao buscar dados ${label}:`, err);
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
        if (throwOnError) {
          setData(null);
        }
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
      }
    },
    [apiPath, label, throwOnError],
  );

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

  const updateCaixaParaInvestir = useCallback(
    async (novoCaixa: number) => {
      try {
        const response = await csrfFetch(apiPath, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ caixaParaInvestir: novoCaixa }),
        });

        if (!response.ok) {
          throw new Error('Erro ao atualizar caixa para investir');
        }

        if (!isMountedRef.current) return false;

        // Recarregar dados apos atualizacao
        await fetchData(true);
        return true;
      } catch (err) {
        console.error('Erro ao atualizar caixa para investir:', err);
        if (!isMountedRef.current) return false;
        setError(err instanceof Error ? err.message : 'Erro ao atualizar caixa para investir');
        return false;
      }
    },
    [fetchData, csrfFetch, apiPath],
  );

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

    // Recalcular totais das secoes
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

    // Recalcular totais gerais
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

  const updateObjetivo = async (ativoId: string, novoObjetivo: number): Promise<boolean | void> => {
    if (!data) return throwOnError ? undefined : false;

    // Backup do estado atual para rollback em caso de erro
    const previousData = structuredClone(data);

    try {
      // Atualizacao otimista: atualizar estado local imediatamente
      setData((prevData) => {
        if (!prevData) return prevData;
        return performOptimisticObjetivoUpdate(prevData, ativoId, novoObjetivo);
      });

      // Fazer chamada a API
      const response = await csrfFetch(objetivoPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ativoId, objetivo: novoObjetivo }),
      });

      if (!response.ok) {
        throw new Error('Erro ao atualizar objetivo');
      }

      if (!throwOnError) return true;
    } catch (err) {
      // Rollback em caso de erro
      if (isMountedRef.current) {
        setData(previousData);
      }
      console.error('Erro ao atualizar objetivo:', err);
      if (throwOnError) {
        throw err;
      }
      if (!isMountedRef.current) return false;
      setError(err instanceof Error ? err.message : 'Erro ao atualizar objetivo');
      return false;
    }
  };

  const updateCotacao = cotacaoPath
    ? async (ativoId: string, novaCotacao: number): Promise<boolean | void> => {
        try {
          const response = await csrfFetch(cotacaoPath, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ativoId, cotacao: novaCotacao }),
          });

          if (!response.ok) {
            throw new Error('Erro ao atualizar cotacao');
          }

          if (!isMountedRef.current) return throwOnError ? undefined : false;

          // Recarregar dados apos atualizacao (forcar reload)
          await fetchData(true);
          if (!throwOnError) return true;
        } catch (err) {
          console.error('Erro ao atualizar cotacao:', err);
          if (throwOnError) {
            throw err;
          }
          if (!isMountedRef.current) return false;
          setError(err instanceof Error ? err.message : 'Erro ao atualizar cotacao');
          return false;
        }
      }
    : undefined;

  const updateValorAtualizado = valorAtualizadoPath
    ? async (ativoId: string, novoValor: number) => {
        try {
          const response = await csrfFetch(valorAtualizadoPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ativoId, campo: 'valorAtualizado', valor: novoValor }),
          });
          if (!response.ok) throw new Error('Erro ao atualizar valor');
          if (!isMountedRef.current) return false;
          await fetchData(true);
          return true;
        } catch (err) {
          console.error('Erro ao atualizar valor:', err);
          if (!isMountedRef.current) return false;
          setError(err instanceof Error ? err.message : 'Erro ao atualizar valor');
          return false;
        }
      }
    : undefined;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // So fazer fetch na montagem inicial
  useEffect(() => {
    if (!hasFetchedRef.current) {
      fetchData(false);
    } else {
      // Se ja tem dados, apenas marcar como nao loading
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wrapper para refetch que forca reload
  const refetch = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch,
    setData,
    fetchData,
    csrfFetch,
    updateObjetivo,
    updateCotacao,
    updateValorAtualizado,
    updateCaixaParaInvestir,
    formatCurrency,
    formatPercentage,
    formatNumber,
  };
}
