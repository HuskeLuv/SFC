'use client';

/**
 * Hooks React Query da Análise de Ativos — Fase 1 (dono: 0a). Contratos em
 * src/types/analiseAtivosApi.ts; keys em queryKeys.analiseAtivos.
 *
 * - useAnaliseAtivosConfig: 10 min; falha = desligado (o menu some).
 * - useQuadroAnalise: useInfiniteQuery de 25 em 25 ("Mostrar mais"), placeholderData = página
 *   anterior (troca de filtro sem piscar), 5 min.
 * - useIndiceBusca: 60 min (o índice inteiro chega uma vez; filtro no cliente).
 * - useOverlayCarteira: 60 s (invalidado por invalidatePortfolioDerivedQueries, fatia D).
 * - useAtivoTopo: 10 min; 404 vira `naoEncontrado` sem retry.
 * - useFundamentosAtivo / useValuationAtivo: 30 min, `enabled` (preguiçosos).
 * - useTese: staleTime 0, sem refetchOnWindowFocus (não sobrescrever o que está sendo digitado).
 * - useSalvarTese: csrfFetch PUT {corpo} (vazio = DELETE).
 * - prefetchAtivoTopo: hover do Quadro.
 *
 * Os dados da carteira NÃO têm hook novo: a fatia D usa useAcoes/useFii/resumo/configuração.
 */
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import { PAGINA_QUADRO } from '@/constants/analiseAtivosVisual';
import type {
  AtivoTopoResposta,
  BuscaIndiceResposta,
  ConfigResposta,
  FundamentosResposta,
  OverlayCarteiraResposta,
  QuadroParams,
  QuadroResposta,
  TeseDeleteResposta,
  TesePutResposta,
  TeseResposta,
  ValuationResposta,
} from '@/types/analiseAtivosApi';

const MIN = 60_000;

export const TEMPOS_ANALISE = {
  config: 10 * MIN,
  quadro: 5 * MIN,
  busca: 60 * MIN,
  carteira: MIN,
  ativo: 10 * MIN,
  analise: 30 * MIN,
} as const;

/** Erro HTTP com status (404 = sem acesso ou inexistente). */
export class ErroAnalise extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function getJson<T>(url: string, padrao: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: 'include', signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ErroAnalise(body?.error ?? `${padrao} (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

/** Não repete 4xx (404 de ticker/sem acesso, 403 da tese); repete até 2× o resto. */
export function retryAnalise(falhas: number, erro: Error): boolean {
  if (erro instanceof ErroAnalise && erro.status >= 400 && erro.status < 500) return false;
  return falhas < 2;
}

const enc = encodeURIComponent;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const CONFIG_DESLIGADA: ConfigResposta = {
  habilitada: false,
  estado: 'desligada',
  acesso: 'beta',
  novoAte: '1970-01-01',
};

export function useAnaliseAtivosConfig() {
  return useQuery<ConfigResposta, Error>({
    queryKey: queryKeys.analiseAtivos.config(),
    staleTime: TEMPOS_ANALISE.config,
    queryFn: async ({ signal }) => {
      try {
        const res = await fetch('/api/analise-ativos/config', { credentials: 'include', signal });
        if (!res.ok) return CONFIG_DESLIGADA;
        return (await res.json()) as ConfigResposta;
      } catch {
        return CONFIG_DESLIGADA;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Quadro
// ---------------------------------------------------------------------------

export type FiltrosQuadro = Omit<QuadroParams, 'offset' | 'limite'>;

/** Query string do Quadro (sem offset/limite); booleanos como '1'; ordem estável. */
export function paramsQuadroParaQuery(params: QuadroParams): URLSearchParams {
  const qs = new URLSearchParams();
  const chaves = Object.keys(params).sort() as Array<keyof QuadroParams>;
  for (const k of chaves) {
    const v = params[k];
    if (v === undefined || v === null || v === false || v === '') continue;
    qs.set(k, v === true ? '1' : String(v));
  }
  return qs;
}

function chaveQuadro(
  filtros: FiltrosQuadro,
): Record<string, string | number | boolean | undefined> {
  return Object.fromEntries(
    Object.entries(filtros).filter(([, v]) => v !== undefined && v !== false && v !== ''),
  );
}

export function useQuadroAnalise(filtros: FiltrosQuadro, opts: { enabled?: boolean } = {}) {
  return useInfiniteQuery<
    QuadroResposta,
    Error,
    InfiniteData<QuadroResposta>,
    ReturnType<typeof queryKeys.analiseAtivos.quadro>,
    number
  >({
    queryKey: queryKeys.analiseAtivos.quadro(chaveQuadro(filtros)),
    initialPageParam: 0,
    staleTime: TEMPOS_ANALISE.quadro,
    placeholderData: keepPreviousData,
    retry: retryAnalise,
    enabled: opts.enabled ?? true,
    queryFn: ({ pageParam, signal }) => {
      const qs = paramsQuadroParaQuery({ ...filtros, offset: pageParam, limite: PAGINA_QUADRO });
      return getJson(
        `/api/analise-ativos/quadro?${qs.toString()}`,
        'Erro ao carregar o Quadro',
        signal,
      );
    },
    getNextPageParam: (ultima) => {
      const proximo = ultima.offset + ultima.itens.length;
      return proximo < ultima.total && ultima.itens.length > 0 ? proximo : undefined;
    },
  });
}

// ---------------------------------------------------------------------------
// Busca e overlay
// ---------------------------------------------------------------------------

export function useIndiceBusca(opts: { enabled?: boolean } = {}) {
  return useQuery<BuscaIndiceResposta, Error>({
    queryKey: queryKeys.analiseAtivos.busca(),
    staleTime: TEMPOS_ANALISE.busca,
    retry: retryAnalise,
    enabled: opts.enabled ?? true,
    queryFn: ({ signal }) =>
      getJson('/api/analise-ativos/busca', 'Erro ao carregar a busca', signal),
  });
}

export function useOverlayCarteira(opts: { enabled?: boolean } = {}) {
  return useQuery<OverlayCarteiraResposta, Error>({
    queryKey: queryKeys.analiseAtivos.carteira(),
    staleTime: TEMPOS_ANALISE.carteira,
    retry: retryAnalise,
    enabled: opts.enabled ?? true,
    queryFn: ({ signal }) =>
      getJson('/api/analise-ativos/carteira', 'Erro ao carregar a carteira', signal),
  });
}

// ---------------------------------------------------------------------------
// Página do ativo
// ---------------------------------------------------------------------------

async function buscarAtivoTopo(ticker: string, signal?: AbortSignal): Promise<AtivoTopoResposta> {
  return getJson(`/api/analise-ativos/ativos/${enc(ticker)}`, 'Erro ao carregar o ativo', signal);
}

export function useAtivoTopo(ticker: string, opts: { enabled?: boolean } = {}) {
  return useQuery<AtivoTopoResposta, Error>({
    queryKey: queryKeys.analiseAtivos.ativo(ticker),
    staleTime: TEMPOS_ANALISE.ativo,
    retry: retryAnalise,
    enabled: (opts.enabled ?? true) && ticker.length > 0,
    queryFn: ({ signal }) => buscarAtivoTopo(ticker, signal),
  });
}

/** Prefetch no hover do Quadro (não refaz se ainda estiver fresco). */
export function prefetchAtivoTopo(qc: QueryClient, ticker: string): Promise<void> {
  return qc.prefetchQuery({
    queryKey: queryKeys.analiseAtivos.ativo(ticker),
    staleTime: TEMPOS_ANALISE.ativo,
    queryFn: ({ signal }) => buscarAtivoTopo(ticker, signal),
  });
}

export function useFundamentosAtivo(ticker: string, opts: { enabled?: boolean } = {}) {
  return useQuery<FundamentosResposta, Error>({
    queryKey: queryKeys.analiseAtivos.fundamentos(ticker),
    staleTime: TEMPOS_ANALISE.analise,
    retry: retryAnalise,
    enabled: (opts.enabled ?? true) && ticker.length > 0,
    queryFn: ({ signal }) =>
      getJson(
        `/api/analise-ativos/ativos/${enc(ticker)}/fundamentos`,
        'Erro ao carregar os fundamentos',
        signal,
      ),
  });
}

export function useValuationAtivo(ticker: string, opts: { enabled?: boolean } = {}) {
  return useQuery<ValuationResposta, Error>({
    queryKey: queryKeys.analiseAtivos.valuation(ticker),
    staleTime: TEMPOS_ANALISE.analise,
    retry: retryAnalise,
    enabled: (opts.enabled ?? true) && ticker.length > 0,
    queryFn: ({ signal }) =>
      getJson(
        `/api/analise-ativos/ativos/${enc(ticker)}/valuation`,
        'Erro ao carregar o valuation',
        signal,
      ),
  });
}

// ---------------------------------------------------------------------------
// Tese privada
// ---------------------------------------------------------------------------

export function useTese(ticker: string, opts: { enabled?: boolean } = {}) {
  return useQuery<TeseResposta, Error>({
    queryKey: queryKeys.analiseAtivos.tese(ticker),
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: retryAnalise,
    enabled: (opts.enabled ?? true) && ticker.length > 0,
    queryFn: ({ signal }) =>
      getJson(`/api/analise-ativos/teses/${enc(ticker)}`, 'Erro ao carregar a tese', signal),
  });
}

/** PUT {corpo}; corpo vazio (após trim) usa DELETE. Atualiza o cache da tese no sucesso. */
export function useSalvarTese(ticker: string) {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<TesePutResposta, Error, { corpo: string }>({
    mutationFn: async ({ corpo }) => {
      const url = `/api/analise-ativos/teses/${enc(ticker)}`;
      const vazio = corpo.trim().length === 0;
      const res = await csrfFetch(
        url,
        vazio
          ? { method: 'DELETE' }
          : {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ corpo }),
            },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new ErroAnalise(body?.error ?? `Erro ao salvar a tese (${res.status})`, res.status);
      }
      if (vazio) {
        (await res.json().catch(() => ({ ok: true }))) as TeseDeleteResposta;
        return { atualizadoEm: null };
      }
      return (await res.json()) as TesePutResposta;
    },
    onSuccess: (r, { corpo }) => {
      qc.setQueryData<TeseResposta>(queryKeys.analiseAtivos.tese(ticker), {
        corpo: corpo.trim().length === 0 ? '' : corpo,
        atualizadoEm: r.atualizadoEm,
        visibilidade: 'privada',
      });
    },
  });
}
