import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

interface AssetFgcInfo {
  id: string;
  nome: string;
  produto: string;
  valorAtual: number;
  valorInvestido: number;
  vencimento: string | null;
  coberto: boolean;
  isentoIR: boolean;
}

interface InstitutionFgcGroup {
  instituicaoId: string;
  instituicaoNome: string;
  cnpj: string | null;
  ativos: AssetFgcInfo[];
  totalCoberto: number;
  totalNaoCoberto: number;
  totalValor: number;
  limiteFgc: number;
  percentualUtilizado: number;
  excedente: number;
}

interface FgcResumo {
  totalEfetivamenteCoberto: number;
  totalNaoCoberto: number;
  totalExcedente: number;
  totalValorRendaFixa: number;
  percentualCoberto: number;
  limiteGlobal: number;
  limitePorInstituicao: number;
  totalAtivos: number;
  totalInstituicoes: number;
}

export interface CoberturaFgcResponse {
  resumo: FgcResumo;
  instituicoes: InstitutionFgcGroup[];
}

export function useCoberturaFgc() {
  const {
    data = null,
    isLoading: loading,
    error: queryError,
  } = useQuery<CoberturaFgcResponse>({
    queryKey: queryKeys.coberturaFgc.all,
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/analises/cobertura-fgc', {
        credentials: 'include',
        signal,
      });
      if (!response.ok) throw new Error('Erro ao carregar dados de cobertura FGC');
      return response.json();
    },
  });

  const error = queryError ? (queryError as Error).message : null;

  return { data, loading, error };
}
