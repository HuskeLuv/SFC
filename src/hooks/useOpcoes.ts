"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { OpcaoData } from '@/types/opcoes';

interface UseOpcoesReturn {
  data: OpcaoData | null;
  loading: boolean;
  error: string | null;
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  updateObjetivo: (ativoId: string, novoObjetivo: number) => Promise<void>;
  updateCotacao: (ativoId: string, novaCotacao: number) => Promise<void>;
  updateCaixaParaInvestir: (novoCaixa: number) => Promise<boolean>;
  refetch: () => void;
}

export const useOpcoes = (): UseOpcoesReturn => {
  const [data, setData] = useState<OpcaoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);
  const hasFetchedRef = useRef(false);

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

  // Prevenir refetch desnecessário: só busca dados uma vez na montagem inicial
  // ou quando explicitamente forçado (ex: após atualização de dados)
  const fetchData = useCallback(async (force = false) => {
    // Prevenir múltiplas chamadas simultâneas
    if (isFetchingRef.current) {
      return;
    }

    // Se já foi feito fetch e não é forçado, não fazer nada
    // Isso evita refetch quando componente remonta ou usuário volta para aba
    if (!force && hasFetchedRef.current) {
      return;
    }

    try {
      isFetchingRef.current = true;
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/carteira/opcoes');
      
      if (!response.ok) {
        throw new Error('Erro ao carregar dados de opções');
      }
      
      const result = await response.json();
      setData(result);
      hasFetchedRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setData(null);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  const updateCaixaParaInvestir = useCallback(async (novoCaixa: number) => {
    try {
      const response = await fetch('/api/carteira/opcoes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ caixaParaInvestir: novoCaixa }),
      });

      if (!response.ok) {
        throw new Error('Erro ao atualizar caixa para investir');
      }

      // Recarregar dados após atualização
      await fetchData(true);
      return true;
    } catch (err) {
      console.error('Erro ao atualizar caixa para investir:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar caixa para investir');
      return false;
    }
  }, [fetchData]);

  const updateObjetivo = async (ativoId: string, novoObjetivo: number): Promise<void> => {
    if (!data) return;

    // Backup do estado atual para rollback em caso de erro
    const previousData = JSON.parse(JSON.stringify(data));

    try {
      // Atualização otimista: atualizar estado local imediatamente
      setData((prevData) => {
        if (!prevData) return prevData;
        
        const updatedSecoes = prevData.secoes.map((secao) => ({
          ...secao,
          ativos: secao.ativos.map((ativo) =>
            ativo.id === ativoId
              ? {
                  ...ativo,
                  objetivo: novoObjetivo,
                  // Recalcular percentualCarteira baseado no total daquele tipo de ativo
                  percentualCarteira: prevData.totalGeral.valorAtualizado > 0
                    ? (ativo.valorAtualizado / prevData.totalGeral.valorAtualizado) * 100
                    : ativo.percentualCarteira,
                  quantoFalta: (() => {
                    const novoPercentualCarteira = prevData.totalGeral.valorAtualizado > 0
                      ? (ativo.valorAtualizado / prevData.totalGeral.valorAtualizado) * 100
                      : ativo.percentualCarteira;
                    return novoObjetivo - novoPercentualCarteira;
                  })(),
                  necessidadeAporte: (() => {
                    // Recalcular percentualCarteira baseado no total daquele tipo de ativo
                    const novoPercentualCarteira = prevData.totalGeral.valorAtualizado > 0
                      ? (ativo.valorAtualizado / prevData.totalGeral.valorAtualizado) * 100
                      : ativo.percentualCarteira;
                    const novoQuantoFalta = novoObjetivo - novoPercentualCarteira;
                    return prevData.totalGeral.valorAtualizado > 0 && novoQuantoFalta > 0
                      ? (novoQuantoFalta / 100) * prevData.totalGeral.valorAtualizado
                      : 0;
                  })(),
                }
              : ativo
          ),
        }));

        // Recalcular totais das seções
        const secoesComTotais = updatedSecoes.map((secao) => {
          const totalObjetivo = secao.ativos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
          const totalQuantoFalta = secao.ativos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
          const totalNecessidadeAporte = secao.ativos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
          return {
            ...secao,
            totalObjetivo,
            totalQuantoFalta,
            totalNecessidadeAporte,
          };
        });

        // Recalcular totais gerais
        const totalObjetivo = secoesComTotais.reduce((sum, secao) => sum + secao.totalObjetivo, 0);
        const totalQuantoFalta = secoesComTotais.reduce((sum, secao) => sum + secao.totalQuantoFalta, 0);
        const totalNecessidadeAporte = secoesComTotais.reduce((sum, secao) => sum + secao.totalNecessidadeAporte, 0);

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
      });

      // Fazer chamada à API
      const response = await fetch('/api/carteira/opcoes/objetivo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ativoId,
          objetivo: novoObjetivo,
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao atualizar objetivo');
      }
    } catch (err) {
      // Rollback em caso de erro
      setData(previousData);
      console.error('Erro ao atualizar objetivo:', err);
      throw err;
    }
  };

  const updateCotacao = async (ativoId: string, novaCotacao: number): Promise<void> => {
    try {
      const response = await fetch('/api/carteira/opcoes/cotacao', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ativoId,
          cotacao: novaCotacao,
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao atualizar cotação');
      }

      // Recarrega os dados após a atualização (forçar reload)
      await fetchData(true);
    } catch (err) {
      console.error('Erro ao atualizar cotação:', err);
      throw err;
    }
  };

  // Só fazer fetch na montagem inicial
  useEffect(() => {
    if (!hasFetchedRef.current) {
      fetchData(false);
    } else {
      // Se já tem dados, apenas marcar como não loading
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wrapper para refetch que força reload
  const refetch = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    formatCurrency,
    formatPercentage,
    formatNumber,
    updateObjetivo,
    updateCotacao,
    updateCaixaParaInvestir,
    refetch,
  };
};

