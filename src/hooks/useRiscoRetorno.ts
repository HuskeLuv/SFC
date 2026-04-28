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
  retornoAnual?: number;
  retornoCDI?: number;
  volatilidade?: number;
  sharpe?: number;
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
    // Payload cobre 36m de histórico + betas — carteira estável serve do cache
    // do servidor por 24h; no cliente mantemos 20 min de frescor pra evitar
    // refetch em toda troca de tab.
    staleTime: 20 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const error = queryError ? (queryError as Error).message : null;

  return { data, loading, error };
}
