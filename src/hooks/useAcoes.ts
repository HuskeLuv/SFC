import { useState, useEffect, useRef, useCallback } from 'react';
import { AcaoData, AcaoAtivo, AcaoSecao } from '@/types/acoes';

export const useAcoes = () => {
  const [data, setData] = useState<AcaoData | null>(null);
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
      
      const response = await fetch('/api/carteira/acoes', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar dados Ações');
      }

      const responseData = await response.json();
      setData(responseData);
      hasFetchedRef.current = true;
    } catch (err) {
      console.error('Erro ao buscar dados Ações:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

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
    return `${value.toFixed(2)}%`;
  };

  const formatNumber = (value: number): string => {
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const calculateAtivoValues = (ativo: Partial<AcaoAtivo>, totalCarteiraAcoes: number, totalCarteiraGeral: number): AcaoAtivo => {
    const quantidade = ativo.quantidade || 0;
    const precoAquisicao = ativo.precoAquisicao || 0;
    const cotacaoAtual = ativo.cotacaoAtual || 0;
    
    const valorTotal = quantidade * precoAquisicao;
    const valorAtualizado = quantidade * cotacaoAtual;
    const riscoPorAtivo = totalCarteiraAcoes > 0 ? (valorAtualizado / totalCarteiraAcoes) * 100 : 0;
    const percentualCarteira = totalCarteiraGeral > 0 ? (valorAtualizado / totalCarteiraGeral) * 100 : 0;
    const objetivo = ativo.objetivo || 0;
    const quantoFalta = objetivo - percentualCarteira;
    const necessidadeAporte = totalCarteiraGeral > 0 ? (quantoFalta / 100) * totalCarteiraGeral : 0;
    const rentabilidade = precoAquisicao > 0 ? ((cotacaoAtual - precoAquisicao) / precoAquisicao) * 100 : 0;

    return {
      id: ativo.id || '',
      ticker: ativo.ticker || '',
      nome: ativo.nome || '',
      setor: ativo.setor || 'outros',
      subsetor: ativo.subsetor || '',
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

  const calculateSecaoValues = (secao: AcaoSecao, totalCarteiraAcoes: number, totalCarteiraGeral: number): AcaoSecao => {
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
      const response = await fetch('/api/carteira/acoes/objetivo', {
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
      const response = await fetch('/api/carteira/acoes/cotacao', {
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
