import { useQuery, keepPreviousData } from '@tanstack/react-query';
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
  yocLifetime?: number;
  lifetimeProventos?: number;
  proceedsPercentage?: number;
  // Enriquecimento para exibição tipo Kinvo (somente quando groupBy === 'ativo')
  classe?: string;
  quantidadeAtual?: number;
  precoMedio?: number;
  cotacaoAtual?: number;
  ultimoProvento?: number;
  ultimoProventoTotal?: number;
  magicNumber?: number;
}

export interface SummaryBucket {
  total: number;
  count: number;
}

export interface FutureIncomeWindow {
  sum: number;
  lastDate: string | null;
  topPayer: { name: string | null; value: number };
}

export interface ProventosKpis {
  totalInvestido: number;
  aportesUlt12m: number;
  rendaAcumulada: { periodo: number; ult12m: number; lifetime: number };
  mediaMensal: { periodo: number; ult12m: number };
  yoc: { periodo: number; ult12m: number; lifetime: number };
  aReceber: {
    futuro: number;
    esseMes: number;
    nextMonth: FutureIncomeWindow;
    next3Months: FutureIncomeWindow;
    next12Months: FutureIncomeWindow;
  };
}

const emptyWindow: FutureIncomeWindow = {
  sum: 0,
  lastDate: null,
  topPayer: { name: null, value: 0 },
};

const emptyKpis: ProventosKpis = {
  totalInvestido: 0,
  aportesUlt12m: 0,
  rendaAcumulada: { periodo: 0, ult12m: 0, lifetime: 0 },
  mediaMensal: { periodo: 0, ult12m: 0 },
  yoc: { periodo: 0, ult12m: 0, lifetime: 0 },
  aReceber: {
    futuro: 0,
    esseMes: 0,
    nextMonth: emptyWindow,
    next3Months: emptyWindow,
    next12Months: emptyWindow,
  },
};

interface ProventosResponse {
  proventos: ProventoData[];
  grouped: Record<string, GroupedProventoData>;
  monthly: Record<string, SummaryBucket>;
  yearly: Record<string, SummaryBucket>;
  total: number;
  media: number;
  kpis: ProventosKpis;
}

const emptyResponse: ProventosResponse = {
  proventos: [],
  grouped: {},
  monthly: {},
  yearly: {},
  total: 0,
  media: 0,
  kpis: emptyKpis,
};

interface UseProventosResult {
  proventos: ProventoData[];
  grouped: Record<string, GroupedProventoData>;
  monthly: Record<string, SummaryBucket>;
  yearly: Record<string, SummaryBucket>;
  total: number;
  media: number;
  kpis: ProventosKpis;
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
    // Mantém os dados anteriores visíveis enquanto um novo período/grupo é buscado.
    // Sem isso, cada clique em pílula troca a queryKey e isLoading volta a true,
    // fazendo a página inteira piscar o spinner.
    placeholderData: keepPreviousData,
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
        kpis: json.kpis || emptyKpis,
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
    kpis: data.kpis,
    loading,
    error: queryError ? (queryError as Error).message : null,
    refetch: () => void queryRefetch(),
  };
};
