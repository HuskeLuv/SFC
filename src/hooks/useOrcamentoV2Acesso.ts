/**
 * Estado do Orçamento v2 para o dono dos dados (`GET /api/cashflow/orcamento/v2/acesso`, desenho
 * técnico §8): a página do Fluxo de Caixa mostra o v2 só com `liberada && ativado` e a tela de
 * hoje quando a resposta diz o contrário. Sem resposta (carregando ou falha) a página não decide:
 * esqueleto ou erro com "Tentar de novo" — a tela antiga nunca aparece para quem está ativado.
 *
 * `ativar` (POST /ativar, idempotente com advisory lock no servidor) serve ao ACESSO=todos (E5);
 * na fase beta a ativação é só pelo script. Depois dela, o acesso e o v2 são invalidados.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';

/** Mesmo contrato de `services/cashflow/orcamentoV2/acesso` (sem importar código de servidor). */
export type EstadoOrcamentoV2 = 'desligada' | 'fora_do_beta' | 'liberada';

export interface AcessoOrcamentoV2Resposta {
  estado: EstadoOrcamentoV2;
  ativado: boolean;
}

export interface AtivacaoOrcamentoV2Resposta {
  status: string;
  motivo?: string | null;
  mudancas?: unknown;
  divergencias?: number;
}

/** O servidor guarda o estado 60 s em cache; aqui 30 s bastam (a página remonta pouco). */
const STALE_MS = 30_000;

/**
 * Uma nova tentativa só (a aba fica no esqueleto enquanto isso; o padrão global seriam ~7 s) e
 * nenhuma em 4xx, que não muda repetindo.
 */
export function deveRepetirAcesso(falhas: number, erro: Error): boolean {
  return falhas < 1 && !/\b4\d\d\b/.test(erro.message);
}

export function useOrcamentoV2Acesso() {
  const queryClient = useQueryClient();
  const { csrfFetch } = useCsrf();

  const query = useQuery<AcessoOrcamentoV2Resposta>({
    queryKey: queryKeys.cashflow.orcamentoV2Acesso(),
    staleTime: STALE_MS,
    retry: deveRepetirAcesso,
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/cashflow/orcamento/v2/acesso', {
        credentials: 'include',
        signal,
      });
      if (!res.ok) throw new Error(`Erro ao consultar o Orçamento v2 (${res.status})`);
      return res.json();
    },
  });

  const ativar = useMutation<AtivacaoOrcamentoV2Resposta, Error, void>({
    mutationFn: async () => {
      const res = await csrfFetch('/api/cashflow/orcamento/v2/ativar', { method: 'POST' });
      const corpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(corpo?.error ?? 'Erro ao ativar o Orçamento v2');
      return corpo as AtivacaoOrcamentoV2Resposta;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.orcamentoV2Acesso() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.orcamentoV2Todos() });
    },
  });

  const estado = query.data?.estado ?? null;
  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    /** `liberada && ativado`: mostrar o v2. */
    usarV2: estado === 'liberada' && query.data?.ativado === true,
    /** Liberada e ainda não ativado (só acontece com ACESSO=todos): a UI chama `ativar`. */
    precisaAtivar: estado === 'liberada' && query.data?.ativado === false,
    refetch: query.refetch,
    ativar,
  };
}
