import { useState, useEffect, useRef, useCallback } from 'react';
import { ReitData, ReitAtivo, ReitSecao } from '@/types/reit';

export const useReit = () => {
  const [data, setData] = useState<ReitData | null>(null);
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
      
      const response = await fetch('/api/carteira/reit', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar dados REIT');
      }

      const responseData = await response.json();
      setData(responseData);
      hasFetchedRef.current = true;
    } catch (err) {
      console.error('Erro ao buscar dados REIT:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  const formatCurrency = (value: number, currency: 'USD' | 'BRL' = 'USD'): string => {
    return value.toLocaleString(currency === 'BRL' ? 'pt-BR' : 'en-US', {
      style: 'currency',
      currency,
    });
  };

  const formatPercentage = (value: number): string => {
    return `${value.toFixed(2)}%`;
  };

  const formatNumber = (value: number): string => {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const calculateAtivoValues = (ativo: Partial<ReitAtivo>, totalCarteiraReit: number, totalCarteiraGeral: number): ReitAtivo => {
    const quantidade = ativo.quantidade || 0;
    const precoAquisicao = ativo.precoAquisicao || 0;
    const cotacaoAtual = ativo.cotacaoAtual || 0;
    
    const valorTotal = quantidade * precoAquisicao;
    const valorAtualizado = quantidade * cotacaoAtual;
    const riscoPorAtivo = totalCarteiraReit > 0 ? (valorAtualizado / totalCarteiraReit) * 100 : 0;
    // Percentual daquele tipo de ativo (não da carteira total)
    const percentualCarteira = totalCarteiraReit > 0 ? (valorAtualizado / totalCarteiraReit) * 100 : 0;
    const objetivo = ativo.objetivo || 0;
    // Quanto falta = diferença entre % atual e objetivo (em %)
    const quantoFalta = objetivo - percentualCarteira;
    // Necessidade de aporte = valor em R$ referente à porcentagem de "quanto falta" (calculado sobre o total daquele tipo de ativo)
    const necessidadeAporte = totalCarteiraReit > 0 && quantoFalta > 0 
      ? (quantoFalta / 100) * totalCarteiraReit 
      : 0;
    const rentabilidade = precoAquisicao > 0 ? ((cotacaoAtual - precoAquisicao) / precoAquisicao) * 100 : 0;

    return {
      id: ativo.id || '',
      ticker: ativo.ticker || '',
      nome: ativo.nome || '',
      setor: ativo.setor || 'other',
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

  const calculateSecaoValues = (secao: ReitSecao, totalCarteiraReit: number, totalCarteiraGeral: number): ReitSecao => {
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
      const response = await fetch('/api/carteira/reit', {
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
      const response = await fetch('/api/carteira/reit/objetivo', {
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

  const updateValorAtualizado = useCallback(async (ativoId: string, novoValor: number) => {
    try {
      const response = await fetch('/api/carteira/reit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ativoId, campo: 'valorAtualizado', valor: novoValor }),
      });
      if (!response.ok) throw new Error('Erro ao atualizar valor');
      await fetchData(true);
      return true;
    } catch (err) {
      console.error('Erro ao atualizar valor:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar valor');
      return false;
    }
  }, [fetchData]);

  const updateCotacao = async (ativoId: string, novaCotacao: number) => {
    try {
      const response = await fetch('/api/carteira/reit/cotacao', {
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
    updateValorAtualizado,
    updateCotacao,
    updateCaixaParaInvestir,
    formatCurrency,
    formatPercentage,
    formatNumber,
    calculateAtivoValues,
    calculateSecaoValues,
  };
};
