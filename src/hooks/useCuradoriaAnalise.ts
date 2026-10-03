'use client';

/**
 * Fila de curadoria da Análise de Ativos (bloco C, fatia C) — /admin/curadoria.
 *
 * Chaves: ['admin','analise-ativos','casos',filtros] (lista) e ['admin','analise-ativos','caso',id]
 * (detalhe). O PATCH (csrfFetch) grava a resposta no detalhe e invalida a lista e o
 * ['admin','overview'] (card do /admin). 409 vira ErroConflitoCaso (a tela mantém o texto digitado
 * e oferece recarregar); 400 vira ErroValidacaoCaso com os details (termos proibidos, resolução).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import type {
  CasoConflito409,
  CasoDetalheResposta,
  CasoPatchBody,
  CasoPatchResposta,
} from '@/types/analiseAtivosCuradoria';
import type {
  CasosListaFiltro,
  CasosListaRespostaFila,
} from '@/services/analiseAtivos/curadoria/filaCuradoria';

export type { CasosListaFiltro, CasosListaRespostaFila };

export const chavesCuradoria = {
  casos: (filtros: CasosListaFiltro) => ['admin', 'analise-ativos', 'casos', filtros] as const,
  todasAsListas: ['admin', 'analise-ativos', 'casos'] as const,
  caso: (id: string) => ['admin', 'analise-ativos', 'caso', id] as const,
};

export class ErroAcessoNegado extends Error {
  constructor() {
    super('forbidden');
  }
}

export class ErroConflitoCaso extends Error {
  constructor(public corpo: CasoConflito409) {
    super(corpo.error);
  }
}

export class ErroValidacaoCaso extends Error {
  constructor(
    message: string,
    public details: Record<string, string[]>,
  ) {
    super(message);
  }
}

function paraQuery(f: CasosListaFiltro): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function lerJson<T>(res: Response): Promise<T> {
  if (res.status === 403) throw new ErroAcessoNegado();
  if (!res.ok) {
    const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(corpo?.error ?? `Erro ${res.status}`);
  }
  return (await res.json()) as T;
}

const semRetentarAcesso = (count: number, err: unknown) =>
  !(err instanceof ErroAcessoNegado) && count < 2;

export function useFilaCuradoria(filtros: CasosListaFiltro) {
  return useQuery<CasosListaRespostaFila>({
    queryKey: chavesCuradoria.casos(filtros),
    staleTime: 30_000,
    retry: semRetentarAcesso,
    placeholderData: (anterior) => anterior,
    queryFn: async ({ signal }) =>
      lerJson(
        await fetch(`/api/admin/analise-ativos/casos${paraQuery(filtros)}`, {
          signal,
          credentials: 'include',
        }),
      ),
  });
}

export function useCasoCuradoria(id: string | null) {
  return useQuery<CasoDetalheResposta>({
    queryKey: chavesCuradoria.caso(id ?? ''),
    enabled: !!id,
    staleTime: 15_000,
    retry: semRetentarAcesso,
    queryFn: async ({ signal }) =>
      lerJson(
        await fetch(`/api/admin/analise-ativos/casos/${encodeURIComponent(id ?? '')}`, {
          signal,
          credentials: 'include',
        }),
      ),
  });
}

export function useAcaoCaso(id: string) {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  return useMutation<CasoPatchResposta, Error, CasoPatchBody>({
    mutationFn: async (corpo) => {
      const res = await csrfFetch(`/api/admin/analise-ativos/casos/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      if (res.status === 409) {
        throw new ErroConflitoCaso((await res.json()) as CasoConflito409);
      }
      if (res.status === 400) {
        const b = (await res.json().catch(() => ({}))) as {
          error?: string;
          details?: Record<string, string[]>;
        };
        throw new ErroValidacaoCaso(b.error ?? 'Dados inválidos', b.details ?? {});
      }
      return lerJson<CasoPatchResposta>(res);
    },
    onSuccess: (resposta) => {
      const { notificados: _n, ...detalhe } = resposta;
      queryClient.setQueryData(chavesCuradoria.caso(id), detalhe);
      void queryClient.invalidateQueries({ queryKey: chavesCuradoria.todasAsListas });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.overview() });
    },
  });
}
