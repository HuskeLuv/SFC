"use client";
import { useState, useEffect } from "react";
import { RendaFixaData } from "@/types/rendaFixa";

export const useRendaFixa = () => {
  const [data, setData] = useState<RendaFixaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/carteira/renda-fixa', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar dados Renda Fixa');
      }

      const responseData = await response.json();
      
      // Converter strings de data para objetos Date
      if (responseData.secoes) {
        responseData.secoes = responseData.secoes.map((secao: any) => ({
          ...secao,
          ativos: secao.ativos.map((ativo: any) => ({
            ...ativo,
            vencimento: ativo.vencimento ? new Date(ativo.vencimento) : new Date(),
          })),
        }));
      }
      
      setData(responseData as RendaFixaData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

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

  const updateCaixaParaInvestir = async (novoCaixa: number) => {
    try {
      const response = await fetch('/api/carteira/renda-fixa', {
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
      await fetchData();
      return true;
    } catch (err) {
      console.error('Erro ao atualizar caixa para investir:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar caixa para investir');
      return false;
    }
  };

  const updateRendaFixaCampo = async (
    portfolioId: string,
    campo: 'cotizacaoResgate' | 'liquidacaoResgate' | 'benchmark' | 'valorAtualizado' | 'observacoes',
    valor: string | number
  ) => {
    try {
      const response = await fetch('/api/carteira/renda-fixa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          ativoId: portfolioId,
          campo,
          valor,
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao atualizar campo');
      }

      // Recarregar dados após atualização
      await fetchData();
      return true;
    } catch (err) {
      console.error('Erro ao atualizar campo:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar campo');
      return false;
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
    updateCaixaParaInvestir,
    updateRendaFixaCampo,
    formatCurrency,
    formatPercentage,
  };
};