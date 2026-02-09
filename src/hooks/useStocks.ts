import { useState, useEffect, useRef, useCallback } from 'react';
import { CarteiraStockData, CarteiraStockAtivo, CarteiraStockSecao } from '@/types/carteiraStocks';

// Hook original para compatibilidade com componentes existentes
export const useStocks = () => {
  return {
    stocks: [
      { id: '1', ticker: 'AAPL', companyName: 'Apple Inc.', sector: 'Technology' },
      { id: '2', ticker: 'MSFT', companyName: 'Microsoft Corporation', sector: 'Technology' },
      { id: '3', ticker: 'GOOGL', companyName: 'Alphabet Inc.', sector: 'Technology' },
      { id: '4', ticker: 'TSLA', companyName: 'Tesla, Inc.', sector: 'Consumer' },
      { id: '5', ticker: 'AMZN', companyName: 'Amazon.com, Inc.', sector: 'Consumer' },
      { id: '6', ticker: 'META', companyName: 'Meta Platforms, Inc.', sector: 'Technology' },
      { id: '7', ticker: 'NVDA', companyName: 'NVIDIA Corporation', sector: 'Technology' },
      { id: '8', ticker: 'JNJ', companyName: 'Johnson & Johnson', sector: 'Healthcare' },
      { id: '9', ticker: 'JPM', companyName: 'JPMorgan Chase & Co.', sector: 'Financials' },
      { id: '10', ticker: 'V', companyName: 'Visa Inc.', sector: 'Financials' }
    ],
    portfolio: [
      {
        stockId: '1',
        ticker: 'AAPL',
        companyName: 'Apple Inc.',
        quantity: 10,
        averagePrice: 150.00,
        currentPrice: 175.50,
        totalValue: 1755.00,
        totalGain: 255.00,
        totalGainPercentage: 17.0
      }
    ],
    transactions: [
      {
        id: '1',
        stock: { ticker: 'AAPL', companyName: 'Apple Inc.' },
        type: 'buy',
        quantity: 10,
        price: 150.00,
        date: new Date(),
        total: 1500.00
      }
    ],
    watchlist: [
      {
        id: '1',
        ticker: 'AAPL',
        companyName: 'Apple Inc.',
        sector: 'Technology',
        notes: 'Tech stock',
        addedAt: new Date(),
        stock: {
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
          priceData: {
            current: 175.50,
            currentPrice: 175.50,
            change: 5.50,
            changePercent: 3.23
          }
        }
      }
    ],
    loading: false,
    error: null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
    addTransaction: async (transaction: any) => true,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    addToWatchlist: async (ticker: string, notes: string) => true,
    getPortfolioStats: () => ({ 
      totalValue: 0, 
      totalGain: 0, 
      totalGainPercentage: 0, 
      totalInvested: 0,
      currentValue: 0,
      totalReturn: 0,
      totalReturnPercentage: 0,
      returnPercent: 0,
      totalQuantity: 0
    })
  };
};

export const useCarteiraStocks = () => {
  const [data, setData] = useState<CarteiraStockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);
  const hasFetchedRef = useRef(false);

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
      
      const response = await fetch('/api/carteira/stocks', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar dados Stocks');
      }

      const responseData = await response.json();
      setData(responseData);
      hasFetchedRef.current = true;
    } catch (err) {
      console.error('Erro ao buscar dados Stocks:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  const formatCurrency = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return '$0.00';
    }
    return value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  const formatPercentage = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return '0.00%';
    }
    return `${value.toFixed(2)}%`;
  };

  const formatNumber = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return '0';
    }
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const calculateAtivoValues = (ativo: Partial<CarteiraStockAtivo>, totalCarteiraStocks: number, totalCarteiraGeral: number): CarteiraStockAtivo => {
    const quantidade = ativo.quantidade || 0;
    const precoAquisicao = ativo.precoAquisicao || 0;
    const cotacaoAtual = ativo.cotacaoAtual || 0;
    
    const valorTotal = quantidade * precoAquisicao;
    const valorAtualizado = quantidade * cotacaoAtual;
    const riscoPorAtivo = totalCarteiraStocks > 0 ? (valorAtualizado / totalCarteiraStocks) * 100 : 0;
    // Percentual daquele tipo de ativo (não da carteira total)
    const percentualCarteira = totalCarteiraStocks > 0 ? (valorAtualizado / totalCarteiraStocks) * 100 : 0;
    const objetivo = ativo.objetivo || 0;
    // Quanto falta = diferença entre % atual e objetivo (em %)
    const quantoFalta = objetivo - percentualCarteira;
    // Necessidade de aporte = valor em R$ referente à porcentagem de "quanto falta" (calculado sobre o total daquele tipo de ativo)
    const necessidadeAporte = totalCarteiraStocks > 0 && quantoFalta > 0 
      ? (quantoFalta / 100) * totalCarteiraStocks 
      : 0;
    const rentabilidade = precoAquisicao > 0 ? ((cotacaoAtual - precoAquisicao) / precoAquisicao) * 100 : 0;

    return {
      id: ativo.id || '',
      ticker: ativo.ticker || '',
      nome: ativo.nome || '',
      sector: ativo.sector || 'other',
      industryCategory: ativo.industryCategory || '',
      quantidade,
      precoAquisicao,
      valorTotal,
      cotacaoAtual,
      valorAtualizado,
      riscoPorAtivo,
      percentualCarteira,
      objetivo,
      quantoFalta,
      necessidadeAporte,
      rentabilidade,
      estrategia: ativo.estrategia || 'value',
      observacoes: ativo.observacoes,
      dataUltimaAtualizacao: ativo.dataUltimaAtualizacao,
    };
  };

  const calculateSecaoValues = (secao: CarteiraStockSecao, totalCarteiraStocks: number, totalCarteiraGeral: number): CarteiraStockSecao => {
    const totalQuantidade = secao.ativos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
    const totalValorAplicado = secao.ativos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
    const totalValorAtualizado = secao.ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const totalPercentualCarteira = totalCarteiraGeral > 0 ? (totalValorAtualizado / totalCarteiraGeral) * 100 : 0;
    const totalRisco = secao.ativos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
    const totalObjetivo = secao.ativos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
    const totalQuantoFalta = secao.ativos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
    const totalNecessidadeAporte = secao.ativos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
    const rentabilidadeMedia = secao.ativos.length > 0 
      ? secao.ativos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / secao.ativos.length 
      : 0;

    return {
      ...secao,
      totalQuantidade,
      totalValorAplicado,
      totalValorAtualizado,
      totalPercentualCarteira,
      totalRisco,
      totalObjetivo,
      totalQuantoFalta,
      totalNecessidadeAporte,
      rentabilidadeMedia,
    };
  };

  const updateCaixaParaInvestir = useCallback(async (novoCaixa: number) => {
    try {
      const response = await fetch('/api/carteira/stocks', {
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

  const updateObjetivo = async (ativoId: string, novoObjetivo: number) => {
    if (!data) return false;

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
      const response = await fetch('/api/carteira/stocks/objetivo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ ativoId, objetivo: novoObjetivo }),
      });

      if (!response.ok) {
        throw new Error('Erro ao atualizar objetivo');
      }

      return true;
    } catch (err) {
      // Rollback em caso de erro
      setData(previousData);
      console.error('Erro ao atualizar objetivo:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar objetivo');
      return false;
    }
  };

  const updateCotacao = async (ativoId: string, novaCotacao: number) => {
    try {
      const response = await fetch('/api/carteira/stocks/cotacao', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ ativoId, cotacao: novaCotacao }),
      });

      if (!response.ok) {
        throw new Error('Erro ao atualizar cotação');
      }

      // Recarregar dados após atualização (forçar reload)
      await fetchData(true);
      return true;
    } catch (err) {
      console.error('Erro ao atualizar cotação:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar cotação');
      return false;
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
    return fetchData(true);
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch,
    updateObjetivo,
    updateCotacao,
    updateCaixaParaInvestir,
    formatCurrency,
    formatPercentage,
    formatNumber,
    calculateAtivoValues,
    calculateSecaoValues,
  };
};