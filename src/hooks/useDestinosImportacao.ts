'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';
import type {
  AplicarDestinosBody,
  AplicarDestinosResponse,
  DestinosImportadosResponse,
  ErroDestinoItem,
} from '@/lib/pluggyDestinos';
import type { ConexaoApiError } from '@/hooks/useConexoesBancarias';

/**
 * Destino na importação Open Finance (out/2026, docs/pluggy-importar-destino/): leitura da
 * revisão, salvamento e Desfazer. Contratos HTTP em src/lib/pluggyDestinos.ts.
 */

const BASE = '/api/pluggy/carteira/destinos';

type CsrfFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Erro com o status HTTP (mesma forma de `ConexaoApiError`) e, no 409 do salvamento, o motivo
 * por item — "Nenhum investimento mudou de lugar".
 */
export class DestinosApiError extends Error implements Pick<ConexaoApiError, 'status'> {
  constructor(
    message: string,
    public status: number,
    public erros: ErroDestinoItem[] = [],
  ) {
    super(message);
  }
}

async function lancarErro(res: Response, fallback: string): Promise<never> {
  const text = await res.text().catch(() => '');
  let message = '';
  let erros: ErroDestinoItem[] = [];
  try {
    const body = JSON.parse(text) as { error?: unknown; erros?: unknown };
    if (typeof body.error === 'string') message = body.error;
    if (Array.isArray(body.erros)) erros = body.erros as ErroDestinoItem[];
  } catch {}
  throw new DestinosApiError(message || `${fallback} (${res.status})`, res.status, erros);
}

/** Depois de salvar ou desfazer: revisão, Conexões, Histórico e tudo o que deriva da Carteira. */
export function invalidarAposDestinos(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: [...queryKeys.pluggy.all, 'destinos'] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.pluggy.carteira() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.historicoAlteracoes.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.carteiraMover.all });
  invalidatePortfolioDerivedQueries(queryClient);
}

export interface UseDestinosImportadosParams {
  connectionId?: string;
  /** Só os 'para-revisar' (aviso de Conexões: novos de sincronizações). */
  paraRevisar?: boolean;
  enabled?: boolean;
}

/** GET /api/pluggy/carteira/destinos */
export function useDestinosImportados({
  connectionId,
  paraRevisar = false,
  enabled = true,
}: UseDestinosImportadosParams = {}) {
  return useQuery<DestinosImportadosResponse, DestinosApiError>({
    queryKey: [...queryKeys.pluggy.destinos(connectionId), paraRevisar ? 'para-revisar' : 'todos'],
    enabled,
    staleTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (connectionId) params.set('connectionId', connectionId);
      if (paraRevisar) params.set('paraRevisar', '1');
      const qs = params.toString();
      const res = await fetch(qs ? `${BASE}?${qs}` : BASE, { credentials: 'include', signal });
      if (!res.ok) await lancarErro(res, 'Erro ao carregar os investimentos');
      return (await res.json()) as DestinosImportadosResponse;
    },
  });
}

/** POST /api/pluggy/carteira/destinos. 409 → `DestinosApiError` com `erros[]` (nada mudou). */
export function useAplicarDestinos() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  return useMutation<AplicarDestinosResponse, DestinosApiError, AplicarDestinosBody>({
    networkMode: 'always',
    mutationFn: async (body) => {
      const res = await csrfFetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) await lancarErro(res, 'Não foi possível salvar');
      return (await res.json()) as AplicarDestinosResponse;
    },
    onSuccess: () => invalidarAposDestinos(queryClient),
  });
}

export interface ResultadoDesfazer {
  /** Undos que deram certo. */
  desfeitos: number;
  /** 409: o investimento foi mudado de novo depois (LIFO por entidade). */
  conflitos: number;
  /** Outras falhas (rede, 5xx). */
  falhas: number;
}

/**
 * Desfaz a escolha de cada historicoId, em ordem REVERSA (um POST por entrada; são entidades
 * diferentes, então a ordem só espelha a gravação). Nunca lança: conta ok / 409 / falha.
 */
export async function desfazerHistoricos(
  csrfFetch: CsrfFetch,
  historicoIds: readonly string[],
): Promise<ResultadoDesfazer> {
  const resultado: ResultadoDesfazer = { desfeitos: 0, conflitos: 0, falhas: 0 };
  for (const id of [...historicoIds].reverse()) {
    try {
      const res = await csrfFetch(`/api/historico-alteracoes/${encodeURIComponent(id)}/undo`, {
        method: 'POST',
      });
      if (res.ok) resultado.desfeitos += 1;
      else if (res.status === 409) resultado.conflitos += 1;
      else resultado.falhas += 1;
    } catch {
      resultado.falhas += 1;
    }
  }
  return resultado;
}

/** Desfazer do toast, desacoplado do componente (o toast vive depois que a revisão fecha). */
export async function desfazerEAtualizar(
  csrfFetch: CsrfFetch,
  queryClient: QueryClient,
  historicoIds: readonly string[],
): Promise<ResultadoDesfazer> {
  try {
    return await desfazerHistoricos(csrfFetch, historicoIds);
  } finally {
    invalidarAposDestinos(queryClient);
  }
}

/** Loop de undo pelos historicoIds (ordem reversa) com as mesmas invalidações do salvar. */
export function useDesfazerDestinos() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  return useMutation<ResultadoDesfazer, Error, readonly string[]>({
    networkMode: 'always',
    mutationFn: (historicoIds) => desfazerEAtualizar(csrfFetch, queryClient, historicoIds),
  });
}
