import { useState, useEffect } from 'react';

export interface CarteiraResumo {
  saldoBruto: number;
  valorAplicado: number;
  rentabilidade: number;
  metaPatrimonio: number;
  historicoPatrimonio: Array<{
    data: number;
    valor: number;
  }>;
  distribuicao: {
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
  const [resumo, setResumo] = useState<CarteiraResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResumo = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/carteira/resumo', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar dados da carteira');
      }

      const data = await response.json();
      setResumo(data);
    } catch (err) {
      console.error('Erro ao buscar resumo da carteira:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const updateMeta = async (novaMetaPatrimonio: number) => {
    try {
      const response = await fetch('/api/carteira/resumo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ metaPatrimonio: novaMetaPatrimonio }),
      });

      if (!response.ok) {
        throw new Error('Erro ao atualizar meta de patrimônio');
      }

      // Recarregar dados após atualização
      await fetchResumo();
      return true;
    } catch (err) {
      console.error('Erro ao atualizar meta:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar meta');
      return false;
    }
  };

  const formatCurrency = (value: number): string => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const formatPercentage = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  useEffect(() => {
    fetchResumo();
  }, []);

  return {
    resumo,
    loading,
    error,
    refetch: fetchResumo,
    updateMeta,
    formatCurrency,
    formatPercentage,
  };
}; 