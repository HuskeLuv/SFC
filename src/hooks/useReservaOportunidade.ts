'use client';
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';

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

const emptyData: ReservaOportunidadeData = {
  ativos: [],
  saldoInicioMes: 0,
  rendimento: 0,
  rentabilidade: 0,
};

export const useReservaOportunidade = () => {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.reserva.oportunidade();

  const {
    data = emptyData,
    isLoading: loading,
    error: queryError,
    refetch: queryRefetch,
  } = useQuery<ReservaOportunidadeData>({
    queryKey,
    queryFn: async () => {
      const response = await fetch('/api/carteira/reserva-oportunidade', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar dados da reserva de oportunidade');
      }

      const responseData = await response.json();

      return {
        ativos: responseData.ativos.map(
          (ativo: ReservaOportunidadeAtivo & { vencimento: Date | string }) => ({
            ...ativo,
            vencimento: new Date(ativo.vencimento),
          }),
        ),
        saldoInicioMes: responseData.saldoInicioMes || 0,
        rendimento: responseData.rendimento || 0,
        rentabilidade: responseData.rentabilidade || 0,
      };
    },
  });

  const refetch = useCallback(() => {
    return queryRefetch().then(() => undefined);
  }, [queryRefetch]);

  const updateValorAtualizado = useCallback(
    async (portfolioId: string, novoValor: number): Promise<void> => {
      try {
        const response = await csrfFetch('/api/carteira/reserva/valor-atualizado', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ portfolioId, valorAtualizado: novoValor }),
        });

        if (!response.ok) {
          throw new Error('Erro ao atualizar valor atualizado');
        }

        await queryClient.invalidateQueries({ queryKey });
      } catch (err) {
        console.error('Erro ao atualizar valor atualizado:', err);
        throw err;
      }
    },
    [csrfFetch, queryClient, queryKey],
  );

  return {
    data,
    loading,
    error: queryError ? (queryError as Error).message : null,
    refetch,
    updateValorAtualizado,
  };
};
