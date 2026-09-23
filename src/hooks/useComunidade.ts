'use client';

/**
 * Comunidade (23/09/2026): feed, posts, comentários, curtidas, denúncias e
 * moderação. Usa sempre o usuário logado — nunca o cliente personificado.
 */

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import type {
  ComentarioComunidade,
  DenunciaComunidade,
  FeedComunidadeResponse,
  MeComunidadeResponse,
  MembroEquipe,
  PostComunidade,
  PostDetalheResponse,
} from '@/types/comunidade';
import type { MotivoDenuncia } from '@/constants/comunidade';

async function lerErro(res: Response, padrao: string): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return new Error(body?.error ?? `${padrao} (${res.status})`);
}

async function getJson<T>(url: string, padrao: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw await lerErro(res, padrao);
  return (await res.json()) as T;
}

/** Flag COMUNIDADE_HABILITADA (menu só aparece ligada). Falha → desligada. */
export function useComunidadeConfig() {
  return useQuery<{ habilitada: boolean }, Error>({
    queryKey: queryKeys.comunidade.config(),
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/comunidade/config', { credentials: 'include', signal });
      if (!res.ok) return { habilitada: false };
      return (await res.json()) as { habilitada: boolean };
    },
  });
}

export function useComunidadeMe() {
  return useQuery<MeComunidadeResponse, Error>({
    queryKey: queryKeys.comunidade.me(),
    queryFn: () => getJson('/api/comunidade/me', 'Erro ao carregar a comunidade'),
  });
}

export function useFeedComunidade(params: {
  categoria: string | null;
  autor?: string | null;
  enabled: boolean;
}) {
  const { categoria, autor = null, enabled } = params;
  return useInfiniteQuery<
    FeedComunidadeResponse,
    Error,
    InfiniteData<FeedComunidadeResponse>,
    ReturnType<typeof queryKeys.comunidade.feed>,
    string | null
  >({
    queryKey: queryKeys.comunidade.feed(categoria, autor),
    initialPageParam: null,
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams();
      if (categoria) qs.set('categoria', categoria);
      if (autor) qs.set('autor', autor);
      if (pageParam) qs.set('cursor', pageParam);
      return getJson(`/api/comunidade/posts?${qs.toString()}`, 'Erro ao carregar o feed');
    },
    getNextPageParam: (ultima) => ultima.nextCursor,
    enabled,
  });
}

export function usePostComunidade(id: string, enabled = true) {
  return useQuery<PostDetalheResponse, Error>({
    queryKey: queryKeys.comunidade.post(id),
    queryFn: () =>
      getJson(`/api/comunidade/posts/${encodeURIComponent(id)}`, 'Erro ao carregar a publicação'),
    enabled: enabled && id.length > 0,
  });
}

/** Aplica `fn` ao post `id` em todos os feeds e no detalhe em cache. */
function atualizarPostEmCache(
  qc: QueryClient,
  id: string,
  fn: (p: PostComunidade) => PostComunidade,
) {
  qc.setQueriesData<InfiniteData<FeedComunidadeResponse>>(
    { queryKey: queryKeys.comunidade.feeds() },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((pg) => ({
          ...pg,
          fixados: pg.fixados.map((p) => (p.id === id ? fn(p) : p)),
          posts: pg.posts.map((p) => (p.id === id ? fn(p) : p)),
        })),
      },
  );
  qc.setQueryData<PostDetalheResponse>(
    queryKeys.comunidade.post(id),
    (data) => data && { ...data, post: fn(data.post) },
  );
}

function useMutacaoComunidade<TVars, TResult = unknown>(
  requisicao: (vars: TVars) => { url: string; method: string; body?: unknown },
  padraoErro: string,
  aoConcluir?: (qc: QueryClient, vars: TVars, result: TResult) => void,
) {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<TResult, Error, TVars>({
    mutationFn: async (vars) => {
      const { url, method, body } = requisicao(vars);
      const res = await csrfFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) throw await lerErro(res, padraoErro);
      return (await res.json()) as TResult;
    },
    onSuccess: (result, vars) => {
      if (aoConcluir) aoConcluir(qc, vars, result);
      else void qc.invalidateQueries({ queryKey: queryKeys.comunidade.all });
    },
  });
}

export const useEntrarComunidade = () =>
  useMutacaoComunidade<{ bio?: string | null; aceitarTermo?: true }>(
    (body) => ({ url: '/api/comunidade/perfil', method: 'PUT', body }),
    'Erro ao salvar o perfil',
  );

export const usePublicarPost = () =>
  useMutacaoComunidade<{ categoria: string; conteudo: string }>(
    (body) => ({ url: '/api/comunidade/posts', method: 'POST', body }),
    'Erro ao publicar',
    (qc) => void qc.invalidateQueries({ queryKey: queryKeys.comunidade.feeds() }),
  );

export const useEditarPost = () =>
  useMutacaoComunidade<
    { id: string; conteudo?: string; categoria?: string },
    { post: PostComunidade }
  >(
    ({ id, ...body }) => ({ url: `/api/comunidade/posts/${id}`, method: 'PATCH', body }),
    'Erro ao editar',
    (qc, { id }, { post }) => {
      atualizarPostEmCache(qc, id, () => post);
      void qc.invalidateQueries({ queryKey: queryKeys.comunidade.feeds() });
    },
  );

export const useExcluirPost = () =>
  useMutacaoComunidade<{ id: string }>(
    ({ id }) => ({ url: `/api/comunidade/posts/${id}`, method: 'DELETE' }),
    'Erro ao excluir',
  );

/** Curtida com atualização otimista (reverte se a API falhar). */
export function useCurtirPost() {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<{ curtiu: boolean; curtidas: number }, Error, { id: string; curtir: boolean }>(
    {
      mutationFn: async ({ id, curtir }) => {
        const res = await csrfFetch(`/api/comunidade/posts/${id}/curtir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ curtir }),
        });
        if (!res.ok) throw await lerErro(res, 'Erro ao curtir');
        return res.json();
      },
      onMutate: ({ id, curtir }) => {
        atualizarPostEmCache(qc, id, (p) =>
          p.curtiu === curtir
            ? p
            : { ...p, curtiu: curtir, curtidas: Math.max(0, p.curtidas + (curtir ? 1 : -1)) },
        );
      },
      onError: (_e, { id, curtir }) => {
        atualizarPostEmCache(qc, id, (p) =>
          p.curtiu !== curtir
            ? p
            : { ...p, curtiu: !curtir, curtidas: Math.max(0, p.curtidas + (curtir ? -1 : 1)) },
        );
      },
      onSuccess: ({ curtiu, curtidas }, { id }) => {
        atualizarPostEmCache(qc, id, (p) => ({ ...p, curtiu, curtidas }));
      },
    },
  );
}

export const useComentar = () =>
  useMutacaoComunidade<{ postId: string; conteudo: string }, { comentario: ComentarioComunidade }>(
    ({ postId, conteudo }) => ({
      url: `/api/comunidade/posts/${postId}/comentarios`,
      method: 'POST',
      body: { conteudo },
    }),
    'Erro ao comentar',
    (qc, { postId }, { comentario }) => {
      qc.setQueryData<PostDetalheResponse>(
        queryKeys.comunidade.post(postId),
        (data) => data && { ...data, comentarios: [...data.comentarios, comentario] },
      );
      atualizarPostEmCache(qc, postId, (p) => ({ ...p, comentarios: p.comentarios + 1 }));
    },
  );

export const useEditarComentario = () =>
  useMutacaoComunidade<{ id: string; postId: string; conteudo: string }>(
    ({ id, conteudo }) => ({
      url: `/api/comunidade/comentarios/${id}`,
      method: 'PATCH',
      body: { conteudo },
    }),
    'Erro ao editar o comentário',
    (qc, { postId }) => void qc.invalidateQueries({ queryKey: queryKeys.comunidade.post(postId) }),
  );

export const useExcluirComentario = () =>
  useMutacaoComunidade<{ id: string; postId: string }>(
    ({ id }) => ({ url: `/api/comunidade/comentarios/${id}`, method: 'DELETE' }),
    'Erro ao excluir o comentário',
    (qc, { postId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.comunidade.post(postId) });
      atualizarPostEmCache(qc, postId, (p) => ({
        ...p,
        comentarios: Math.max(0, p.comentarios - 1),
      }));
    },
  );

export const useDenunciar = () =>
  useMutacaoComunidade<{
    postId?: string;
    commentId?: string;
    motivo: MotivoDenuncia;
    detalhe?: string;
  }>(
    (body) => ({ url: '/api/comunidade/denuncias', method: 'POST', body }),
    'Erro ao enviar a denúncia',
    () => undefined,
  );

// ------------------------------------------------------------------ moderação

export function useDenunciasAbertas(enabled: boolean) {
  return useQuery<{ denuncias: DenunciaComunidade[] }, Error>({
    queryKey: queryKeys.comunidade.denuncias(),
    queryFn: () => getJson('/api/comunidade/moderacao/denuncias', 'Erro ao carregar denúncias'),
    enabled,
  });
}

export type AcaoModeracaoInput =
  | { tipo: 'ocultar'; postId?: string; commentId?: string; motivo?: string }
  | { tipo: 'restaurar'; postId?: string; commentId?: string }
  | { tipo: 'fixar' | 'desafixar'; postId: string }
  | { tipo: 'descartar-denuncia'; denunciaId: string }
  | { tipo: 'suspender'; userId: string; dias: number; motivo?: string }
  | { tipo: 'reativar'; userId: string };

export const useModerar = () =>
  useMutacaoComunidade<AcaoModeracaoInput>(
    (body) => ({ url: '/api/comunidade/moderacao/acao', method: 'POST', body }),
    'Erro na moderação',
  );

export function useEquipeComunidade(enabled: boolean) {
  return useQuery<{ equipe: MembroEquipe[] }, Error>({
    queryKey: queryKeys.comunidade.equipe(),
    queryFn: () => getJson('/api/comunidade/equipe', 'Erro ao carregar a equipe'),
    enabled,
  });
}

export const useDefinirCargo = () =>
  useMutacaoComunidade<{ email: string; cargo: 'membro' | 'equipe' }>(
    (body) => ({ url: '/api/comunidade/equipe', method: 'POST', body }),
    'Erro ao atualizar a equipe',
  );
