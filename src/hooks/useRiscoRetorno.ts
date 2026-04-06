import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

interface RiscoRetornoMetrics {
  retornoAnual: number;
  retornoCDI: number;
  volatilidade: number;
  sharpe: number;
}

interface SensibilidadeItem {
  ticker: string;
  nome: string;
  beta: number;
}

export interface RiscoRetornoResponse {
  carteira: RiscoRetornoMetrics;
  anual: Record<number, RiscoRetornoMetrics>;
  sensibilidade: SensibilidadeItem[];
  anosDisponiveis: number[];
}

export function useRiscoRetorno() {
  const {
    data = null,
    isLoading: loading,
    error: queryError,
  } = useQuery<RiscoRetornoResponse>({
    queryKey: queryKeys.riscoRetorno.all,
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/analises/risco-retorno', {
        credentials: 'include',
        signal,
      });
      if (!response.ok) throw new Error('Erro ao carregar dados de risco x retorno');
      return response.json();
    },
  });

  const error = queryError ? (queryError as Error).message : null;

  return { data, loading, error };
}
