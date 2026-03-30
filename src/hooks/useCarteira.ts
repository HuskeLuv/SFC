import { useState, useEffect, useCallback, useRef } from 'react';
import { useCsrf } from '@/hooks/useCsrf';

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
  distribuicao: {
    reservaEmergencia: {
      valor: number;
      percentual: number;
    };
    reservaOportunidade: {
      valor: number;
      percentual: number;
    };
    rendaFixaFundos: {
      valor: number;
      percentual: number;
    };
    fimFia: {
      valor: number;
      percentual: number;
    };
    fiis: {
      valor: number;
      percentual: number;
    };
    acoes: {
      valor: number;
      percentual: number;
    };
    stocks: {
      valor: number;
      percentual: number;
    };
    reits: {
      valor: number;
      percentual: number;
    };
    etfs: {
      valor: number;
      percentual: number;
    };
    moedasCriptos: {
      valor: number;
      percentual: number;
    };
    previdenciaSeguros: {
      valor: number;
      percentual: number;
    };
    opcoes: {
      valor: number;
      percentual: number;
    };
    imoveisBens: {
      valor: number;
      percentual: number;
    };
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
  const [resumo, setResumo] = useState<CarteiraResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);
  const hasFetchedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const fetchResumo = useCallback(async (force = false, includeHistorico = true) => {
    // Prevenir múltiplas chamadas simultâneas
    if (isFetchingRef.current) {
      return;
    }

    // Se já foi feito fetch e não é forçado, não fazer nada
    if (!force && hasFetchedRef.current) {
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      isFetchingRef.current = true;
      setLoading(true);
      setError(null);

      const url = `/api/carteira/resumo${includeHistorico ? '' : '?includeHistorico=false'}`;
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (!response.ok) {
        throw new Error('Erro ao carregar dados da carteira');
      }

      const data = await response.json();
      if (controller.signal.aborted) return;
      setResumo(data);
      hasFetchedRef.current = true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Erro ao buscar resumo da carteira:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  const fetchResumoProgressive = useCallback(async (force = false) => {
    if (isFetchingRef.current) return;
    if (!force && hasFetchedRef.current) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      isFetchingRef.current = true;
      setLoading(true);
      setError(null);

      // 1ª requisição: resumo rápido sem histórico (carregamento inicial rápido)
      const responseFast = await fetch('/api/carteira/resumo?includeHistorico=false', {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!responseFast.ok) throw new Error('Erro ao carregar dados da carteira');

      const dataFast = await responseFast.json();
      if (controller.signal.aborted) return;
      setResumo(dataFast);
      hasFetchedRef.current = true;
      setLoading(false);
      isFetchingRef.current = false;

      // 2ª requisição: histórico completo em background (atualiza gráfico quando pronto)
      const responseFull = await fetch('/api/carteira/resumo', {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (responseFull.ok) {
        const dataFull = await responseFull.json();
        if (controller.signal.aborted) return;
        setResumo(dataFull);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Erro ao buscar resumo da carteira:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  const updateMeta = useCallback(
    async (novaMetaPatrimonio: number) => {
      try {
        const response = await csrfFetch('/api/carteira/resumo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ metaPatrimonio: novaMetaPatrimonio }),
        });

        if (!response.ok) {
          throw new Error('Erro ao atualizar meta de patrimônio');
        }

        if (!isMountedRef.current) return false;

        // Recarregar dados após atualização (forçar reload)
        await fetchResumo(true);
        return true;
      } catch (err) {
        console.error('Erro ao atualizar meta:', err);
        if (!isMountedRef.current) return false;
        setError(err instanceof Error ? err.message : 'Erro ao atualizar meta');
        return false;
      }
    },
    [fetchResumo, csrfFetch],
  );

  const updateCaixaParaInvestir = useCallback(
    async (novoCaixa: number) => {
      if (!resumo) {
        return false;
      }

      // Salvar estado anterior para rollback em caso de erro
      const previousResumo = resumo;

      // Atualização otimista: atualizar o estado local imediatamente
      setResumo({
        ...resumo,
        caixaParaInvestir: novoCaixa,
      });

      try {
        const response = await csrfFetch('/api/carteira/resumo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ caixaParaInvestir: novoCaixa }),
        });

        if (!response.ok) {
          throw new Error('Erro ao atualizar caixa para investir');
        }

        return true;
      } catch (err) {
        // Rollback em caso de erro
        if (isMountedRef.current) {
          setResumo(previousResumo);
        }
        console.error('Erro ao atualizar caixa para investir:', err);
        if (!isMountedRef.current) return false;
        setError(err instanceof Error ? err.message : 'Erro ao atualizar caixa para investir');
        return false;
      }
    },
    [resumo, csrfFetch],
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // Carregamento progressivo: resumo rápido primeiro, histórico completo em background
  useEffect(() => {
    if (!hasFetchedRef.current) {
      fetchResumoProgressive(false);
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch progressivo (após add/resgate): dados atualizados rápido, histórico em background
  const refetch = useCallback(() => {
    return fetchResumoProgressive(true);
  }, [fetchResumoProgressive]);

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
