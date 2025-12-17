import { useState, useEffect, useRef, useCallback } from 'react';
import { FimFiaData, FimFiaAtivo, FimFiaSecao } from '@/types/fimFia';

export const useFimFia = () => {
  const [data, setData] = useState<FimFiaData | null>(null);
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
      
      const response = await fetch('/api/carteira/fim-fia', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar dados FIM/FIA');
      }

      const responseData = await response.json();
      setData(responseData);
      hasFetchedRef.current = true;
    } catch (err) {
      console.error('Erro ao buscar dados FIM/FIA:', err);
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

  const calculateAtivoValues = (ativo: Partial<FimFiaAtivo>, totalCarteira: number): FimFiaAtivo => {
    const valorInicial = ativo.valorInicialAplicado || 0;
    const aporte = ativo.aporte || 0;
    const resgate = ativo.resgate || 0;
    const valorAtualizado = valorInicial + aporte - resgate;
    const percentualCarteira = totalCarteira > 0 ? (valorAtualizado / totalCarteira) * 100 : 0;
    const riscoPorAtivo = totalCarteira > 0 ? (valorAtualizado / totalCarteira) * 100 : 0;
    const objetivo = ativo.objetivo || 0;
    const quantoFalta = objetivo - percentualCarteira;
    const necessidadeAporte = totalCarteira > 0 ? (quantoFalta / 100) * totalCarteira : 0;
    const rentabilidade = valorInicial > 0 ? ((valorAtualizado - valorInicial) / valorInicial) * 100 : 0;

    return {
      id: ativo.id || '',
      nome: ativo.nome || '',
      cotizacaoResgate: ativo.cotizacaoResgate || '',
      liquidacaoResgate: ativo.liquidacaoResgate || '',
      categoriaNivel1: ativo.categoriaNivel1 || '',
      subcategoriaNivel2: ativo.subcategoriaNivel2 || '',
      valorInicialAplicado: valorInicial,
      aporte,
      resgate,
      valorAtualizado,
      percentualCarteira,
      riscoPorAtivo,
      objetivo,
      quantoFalta,
      necessidadeAporte,
      rentabilidade,
      tipo: ativo.tipo || 'fim',
      observacoes: ativo.observacoes,
    };
  };

  const calculateSecaoValues = (secao: FimFiaSecao, totalCarteira: number): FimFiaSecao => {
    const totalValorAplicado = secao.ativos.reduce((sum, ativo) => sum + ativo.valorInicialAplicado, 0);
    const totalAporte = secao.ativos.reduce((sum, ativo) => sum + ativo.aporte, 0);
    const totalResgate = secao.ativos.reduce((sum, ativo) => sum + ativo.resgate, 0);
    const totalValorAtualizado = secao.ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const totalPercentualCarteira = totalCarteira > 0 ? (totalValorAtualizado / totalCarteira) * 100 : 0;
    const totalRisco = secao.ativos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
    const totalObjetivo = secao.ativos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
    const totalQuantoFalta = secao.ativos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
    const totalNecessidadeAporte = secao.ativos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
    const rentabilidadeMedia = secao.ativos.length > 0 
      ? secao.ativos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / secao.ativos.length 
      : 0;

    return {
      ...secao,
      totalValorAplicado,
      totalAporte,
      totalResgate,
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
      const response = await fetch('/api/carteira/fim-fia/objetivo', {
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

  useEffect(() => {
    fetchData();
  }, []);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
    updateObjetivo,
    formatCurrency,
    formatPercentage,
    calculateAtivoValues,
    calculateSecaoValues,
  };
};
