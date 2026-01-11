"use client";
import { useState, useEffect, useCallback, useRef } from "react";

export interface ReservaOportunidadeAtivo {
  id: string;
  nome: string;
  cotizacaoResgate: string;
  liquidacaoResgate: string;
  vencimento: Date;
  benchmark: string;
  valorInicial: number;
  aporte: number;
  resgate: number;
  valorAtualizado: number;
  percentualCarteira: number;
  riscoAtivo: number;
  rentabilidade: number;
  observacoes?: string;
}

export interface ReservaOportunidadeData {
  ativos: ReservaOportunidadeAtivo[];
  saldoInicioMes: number;
  rendimento: number;
  rentabilidade: number;
}

export const useReservaOportunidade = () => {
  const [data, setData] = useState<ReservaOportunidadeData>({
    ativos: [],
    saldoInicioMes: 0,
    rendimento: 0,
    rentabilidade: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);
  const hasFetchedRef = useRef(false);

  const fetchReservaOportunidade = useCallback(async (force = false) => {
    // Prevenir múltiplas chamadas simultâneas
    if (isFetchingRef.current) {
      return;
    }

    // Se já foi feito fetch e não é forçado, não fazer nada
    if (!force && hasFetchedRef.current) {
      return;
    }

    try {
      isFetchingRef.current = true;
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/carteira/reserva-oportunidade', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar dados da reserva de oportunidade');
      }

      const responseData = await response.json();
      
      // Transformar dados recebidos para o formato esperado
      const transformedData: ReservaOportunidadeData = {
        ativos: responseData.ativos.map((ativo: any) => ({
          ...ativo,
          vencimento: new Date(ativo.vencimento),
        })),
        saldoInicioMes: responseData.saldoInicioMes || 0,
        rendimento: responseData.rendimento || 0,
        rentabilidade: responseData.rentabilidade || 0,
      };
      
      setData(transformedData);
      hasFetchedRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Só fazer fetch na montagem inicial
  useEffect(() => {
    if (!hasFetchedRef.current) {
      fetchReservaOportunidade(false);
    } else {
      // Se já tem dados, apenas marcar como não loading
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wrapper para refetch que força reload
  const refetch = useCallback(() => {
    return fetchReservaOportunidade(true);
  }, [fetchReservaOportunidade]);

  const updateValorAtualizado = useCallback(async (portfolioId: string, novoValor: number): Promise<void> => {
    try {
      const response = await fetch('/api/carteira/reserva/valor-atualizado', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          portfolioId,
          valorAtualizado: novoValor,
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao atualizar valor atualizado');
      }

      // Recarrega os dados após a atualização
      await fetchReservaOportunidade(true);
    } catch (err) {
      console.error('Erro ao atualizar valor atualizado:', err);
      throw err;
    }
  }, [fetchReservaOportunidade]);

  return {
    data,
    loading,
    error,
    refetch,
    updateValorAtualizado,
  };
};
