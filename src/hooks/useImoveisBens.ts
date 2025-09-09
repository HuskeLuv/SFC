"use client";
import { useState, useEffect } from 'react';
import { ImovelBemData } from '@/types/imoveis-bens';

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
  const [data, setData] = useState<ImovelBemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/carteira/imoveis-bens');
      
      if (!response.ok) {
        throw new Error('Erro ao carregar dados de imóveis e bens');
      }
      
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const updateValorAtualizado = async (ativoId: string, novoValor: number): Promise<void> => {
    try {
      const response = await fetch('/api/carteira/imoveis-bens/valor-atualizado', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ativoId,
          valorAtualizado: novoValor,
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao atualizar valor atualizado');
      }

      // Recarrega os dados após a atualização
      await fetchData();
    } catch (err) {
      console.error('Erro ao atualizar valor atualizado:', err);
      throw err;
    }
  };

  const refetch = () => {
    fetchData();
  };

  useEffect(() => {
    fetchData();
  }, []);

  return {
    data,
    loading,
    error,
    formatCurrency,
    formatPercentage,
    formatNumber,
    updateValorAtualizado,
    refetch,
  };
};

