"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { PrevidenciaSegurosData } from '@/types/previdencia-seguros';

interface UsePrevidenciaSegurosReturn {
  data: PrevidenciaSegurosData | null;
  loading: boolean;
  error: string | null;
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  updateObjetivo: (ativoId: string, novoObjetivo: number) => Promise<void>;
  updateCotacao: (ativoId: string, novaCotacao: number) => Promise<void>;
  refetch: () => void;
}

export const usePrevidenciaSeguros = (): UsePrevidenciaSegurosReturn => {
  const [data, setData] = useState<PrevidenciaSegurosData | null>(null);
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
      
      const response = await fetch('/api/carteira/previdencia-seguros');
      
      if (!response.ok) {
        throw new Error('Erro ao carregar dados de previdência e seguros');
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

  const updateObjetivo = async (ativoId: string, novoObjetivo: number): Promise<void> => {
    try {
      const response = await fetch('/api/carteira/previdencia-seguros/objetivo', {
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

      // Recarrega os dados após a atualização (forçar reload)
      await fetchData(true);
    } catch (err) {
      console.error('Erro ao atualizar objetivo:', err);
      throw err;
    }
  };

  const updateCotacao = async (ativoId: string, novaCotacao: number): Promise<void> => {
    try {
      const response = await fetch('/api/carteira/previdencia-seguros/cotacao', {
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
    refetch,
  };
};

