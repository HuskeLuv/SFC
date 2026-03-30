import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

export interface ProventoData {
  id: string;
  data: string;
  symbol: string;
  ativo: string;
  tipo: string;
  classe?: string;
  valor: number;
  quantidade: number;
  valorUnitario: number;
  status: 'realizado' | 'a_receber';
}

export interface GroupedProventoData {
  total: number;
  count: number;
  items: ProventoData[];
  invested?: number;
  currentValue?: number;
  dividendYield?: number;
  yoc?: number;
}

export interface SummaryBucket {
  total: number;
  count: number;
}

interface ProventosResponse {
  proventos: ProventoData[];
  grouped: Record<string, GroupedProventoData>;
  monthly: Record<string, SummaryBucket>;
  yearly: Record<string, SummaryBucket>;
  total: number;
  media: number;
}

const emptyResponse: ProventosResponse = {
  proventos: [],
  grouped: {},
  monthly: {},
  yearly: {},
  total: 0,
  media: 0,
};

interface UseProventosResult {
  proventos: ProventoData[];
  grouped: Record<string, GroupedProventoData>;
  monthly: Record<string, SummaryBucket>;
  yearly: Record<string, SummaryBucket>;
  total: number;
  media: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export const useProventos = (
  startDate?: string,
  endDate?: string,
  groupBy: 'ativo' | 'classe' | 'tipo' = 'ativo',
): UseProventosResult => {
  const {
    data = emptyResponse,
    isLoading: loading,
    error: queryError,
    refetch: queryRefetch,
  } = useQuery<ProventosResponse>({
    queryKey: [...queryKeys.proventos.all, startDate, endDate, groupBy],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('groupBy', groupBy);

      const response = await fetch(`/api/analises/proventos?${params.toString()}`, { signal });

      if (!response.ok) {
        throw new Error('Erro ao buscar dados de proventos');
      }

      const json = await response.json();
      return {
        proventos: json.proventos || [],
        grouped: json.grouped || {},
        monthly: json.monthly || {},
        yearly: json.yearly || {},
        total: json.total || 0,
        media: json.media || 0,
      };
    },
  });

  return {
    proventos: data.proventos,
    grouped: data.grouped,
    monthly: data.monthly,
    yearly: data.yearly,
    total: data.total,
    media: data.media,
    loading,
    error: queryError ? (queryError as Error).message : null,
    refetch: () => void queryRefetch(),
  };
};
