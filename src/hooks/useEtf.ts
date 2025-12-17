import { useState, useEffect, useRef, useCallback } from 'react';
import { EtfData, EtfAtivo, EtfSecao } from '@/types/etf';

export const useEtf = () => {
  const [data, setData] = useState<EtfData | null>(null);
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
      
      const response = await fetch('/api/carteira/etf', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar dados ETF');
      }

      const responseData = await response.json();
      setData(responseData);
      hasFetchedRef.current = true;
    } catch (err) {
      console.error('Erro ao buscar dados ETF:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  const formatCurrency = (value: number, currency: 'BRL' | 'USD' = 'BRL'): string => {
    return value.toLocaleString(currency === 'BRL' ? 'pt-BR' : 'en-US', {
      style: 'currency',
      currency: currency,
    });
  };

  const formatPercentage = (value: number): string => {
    return `${value.toFixed(2)}%`;
  };

  const formatNumber = (value: number): string => {
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const calculateAtivoValues = (ativo: Partial<EtfAtivo>, totalCarteiraEtf: number, totalCarteiraGeral: number): EtfAtivo => {
    const quantidade = ativo.quantidade || 0;
    const precoAquisicao = ativo.precoAquisicao || 0;
    const cotacaoAtual = ativo.cotacaoAtual || 0;
    
    const valorTotal = quantidade * precoAquisicao;
    const valorAtualizado = quantidade * cotacaoAtual;
    const riscoPorAtivo = totalCarteiraEtf > 0 ? (valorAtualizado / totalCarteiraEtf) * 100 : 0;
    const percentualCarteira = totalCarteiraGeral > 0 ? (valorAtualizado / totalCarteiraGeral) * 100 : 0;
    const objetivo = ativo.objetivo || 0;
    const quantoFalta = objetivo - percentualCarteira;
    const necessidadeAporte = totalCarteiraGeral > 0 ? (quantoFalta / 100) * totalCarteiraGeral : 0;
    const rentabilidade = precoAquisicao > 0 ? ((cotacaoAtual - precoAquisicao) / precoAquisicao) * 100 : 0;

    return {
      id: ativo.id || '',
      ticker: ativo.ticker || '',
      nome: ativo.nome || '',
      indiceRastreado: ativo.indiceRastreado || 'outros',
      regiao: ativo.regiao || 'brasil',
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
      observacoes: ativo.observacoes,
      dataUltimaAtualizacao: ativo.dataUltimaAtualizacao,
    };
  };

  const calculateSecaoValues = (secao: EtfSecao, totalCarteiraEtf: number, totalCarteiraGeral: number): EtfSecao => {
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

  const updateObjetivo = async (ativoId: string, novoObjetivo: number) => {
    try {
      const response = await fetch('/api/carteira/etf/objetivo', {
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

      // Recarregar dados após atualização (forçar reload)
      await fetchData(true);
      return true;
    } catch (err) {
      console.error('Erro ao atualizar objetivo:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar objetivo');
      return false;
    }
  };

  const updateCotacao = async (ativoId: string, novaCotacao: number) => {
    try {
      const response = await fetch('/api/carteira/etf/cotacao', {
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
    formatCurrency,
    formatPercentage,
    formatNumber,
    calculateAtivoValues,
    calculateSecaoValues,
  };
};
