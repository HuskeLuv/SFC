'use client';

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

export interface ReservaEmergenciaAtivo {
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
}

export interface ReservaEmergenciaData {
  ativos: ReservaEmergenciaAtivo[];
  saldoInicioMes: number;
  rendimento: number;
  rentabilidade: number;
}

const emptyData: ReservaEmergenciaData = {
  ativos: [],
  saldoInicioMes: 0,
  rendimento: 0,
  rentabilidade: 0,
};

export const useReservaEmergencia = () => {
  const queryKey = queryKeys.reserva.emergencia();

  const {
    data = emptyData,
    isLoading: loading,
    error: queryError,
    refetch: queryRefetch,
  } = useQuery<ReservaEmergenciaData>({
    queryKey,
    queryFn: async () => {
      const response = await fetch('/api/carteira/reserva-emergencia', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar dados da reserva de emergência');
      }

      const responseData = await response.json();

      return {
        ativos: responseData.ativos.map(
          (ativo: ReservaEmergenciaAtivo & { vencimento: Date | string }) => ({
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

  return {
    data,
    loading,
    error: queryError ? (queryError as Error).message : null,
    refetch,
  };
};
