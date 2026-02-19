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
    // Percentual daquele tipo de ativo (não da carteira total)
    const percentualCarteira = totalCarteira > 0 ? (valorAtualizado / totalCarteira) * 100 : 0;
    const riscoPorAtivo = totalCarteira > 0 ? (valorAtualizado / totalCarteira) * 100 : 0;
    const objetivo = ativo.objetivo || 0;
    // Quanto falta = diferença entre % atual e objetivo (em %)
    const quantoFalta = objetivo - percentualCarteira;
    // Necessidade de aporte = valor em R$ referente à porcentagem de "quanto falta" (calculado sobre o total daquele tipo de ativo)
    const necessidadeAporte = totalCarteira > 0 && quantoFalta > 0 
      ? (quantoFalta / 100) * totalCarteira 
      : 0;
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

  const updateCaixaParaInvestir = useCallback(async (novoCaixa: number) => {
    try {
      const response = await fetch('/api/carteira/fim-fia', {
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

  const updateValorAtualizado = useCallback(async (ativoId: string, novoValor: number) => {
    try {
      const response = await fetch('/api/carteira/fim-fia', {
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

      return true;
    } catch (err) {
      // Rollback em caso de erro
      setData(previousData);
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
    updateValorAtualizado,
    updateCaixaParaInvestir,
    formatCurrency,
    formatPercentage,
    calculateAtivoValues,
    calculateSecaoValues,
  };
};
