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
      
      // Retornar dados vazios por enquanto
      const emptyData: RendaFixaData = {
        resumo: {
          necessidadeAporte: 0,
          caixaParaInvestir: 0,
          saldoInicioMes: 0,
          saldoAtual: 0,
          rendimento: 0,
          rentabilidade: 0
        },
        secoes: [],
        totalGeral: {
          quantidade: 0,
          valorAplicado: 0,
          valorAtualizado: 0,
          percentualCarteira: 0,
          risco: 0,
          objetivo: 0,
          quantoFalta: 0,
          necessidadeAporte: 0,
          rentabilidade: 0
        }
      };
      
      setData(emptyData);
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

  useEffect(() => {
    fetchData();
  }, []);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
    formatCurrency,
    formatPercentage,
  };
};