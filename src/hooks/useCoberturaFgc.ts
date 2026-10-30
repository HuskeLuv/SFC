import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { SemCoberturaFgc } from '@/services/analises/semCoberturaFgc';
import type {
  AvisoConglomerado,
  FgcResumo,
  InstitutionFgcGroup,
} from '@/services/analises/agruparCoberturaFgc';

export type {
  AssetFgcInfo,
  AvisoConglomerado,
  FgcResumo,
  FonteInstituicao,
  InstitutionFgcGroup,
} from '@/services/analises/agruparCoberturaFgc';

export interface CoberturaFgcResponse {
  resumo: FgcResumo;
  /** Grupos por banco emissor (raiz do CNPJ); sem emissor, pela corretora (86e2xqh69). */
  instituicoes: InstitutionFgcGroup[];
  /** Grupos do mesmo conglomerado do Bacen: só aviso, o limite continua por emissor. */
  avisosConglomerado?: AvisoConglomerado[];
  /** O resto da carteira, fora do FGC, por classe (ClickUp 86e2vvde3). */
  semCobertura?: SemCoberturaFgc;
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
