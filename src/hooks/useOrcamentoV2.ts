/**
 * Orçamento v2 (ticket 86e3v8p3u, desenho técnico §6.3/§7): query do `GET /api/cashflow/orcamento/v2`
 * e as mutações da tela, com React Query como os demais hooks do Fluxo de Caixa.
 *
 * - Query: `queryKeys.cashflow.orcamentoV2(ano, mes, visao, fonte)` (fonte 'padrao' = a das
 *   prefs). `credentials: 'include'`; o status, o ritmo e os KPIs chegam prontos do servidor.
 * - `salvarOrcado` e `marcarFixa`: OTIMISTAS — recalculam a linha/categoria/resumo no cache com as
 *   mesmas regras puras do servidor (`lib/orcamento/otimista`), fazem o PUT/PATCH com csrfFetch,
 *   trocam o palpite pela resposta (`{subcategoria, categoria, resumo}`) e, no erro, voltam ao
 *   payload anterior (rollback). As outras visões/meses do v2 são invalidadas.
 * - `salvarPrefs`: otimista nas prefs de todos os payloads do v2 em cache, com rollback. O
 *   debounce (500 ms) fica com quem chama.
 * - `copiarMes`: sem palpite (o servidor decide o que copia); no sucesso invalida todo o v2 (a
 *   cópia pode cruzar o ano).
 * Mês 1–12 em tudo (a API converte).
 */
import { useCallback } from 'react';
import {
  hashKey,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import {
  aplicarNaSubcategoria,
  aplicarOrcadoOtimista,
  aplicarRespostaEscrita,
} from '@/lib/orcamento/otimista';
import type {
  AnoMes,
  CopiarMesResponse,
  FonteOrcamento,
  OrcadoEscritaResponse,
  OrcamentoV2Response,
  PrefsEscritaBody,
  PrefsEscritaResponse,
  VisaoOrcamento,
} from '@/types/orcamentoV2';

export interface ParamsUseOrcamentoV2 {
  ano: number;
  /** 1–12. */
  mes: number;
  visao?: VisaoOrcamento;
  /** Ausente = a fonte salva nas prefs. */
  fonte?: FonteOrcamento;
}

/** `valor` (R$, `null` limpa) OU `pct` (% da receita, só Planejamento). */
export type SalvarOrcadoEntrada =
  | { itemId: string; valor: number | null }
  | { itemId: string; pct: number };

export interface MarcarFixaEntrada {
  itemId: string;
  /** `null` = volta ao padrão do catálogo. */
  fixa: boolean | null;
}

export interface CopiarMesEntrada {
  de: AnoMes;
  /** Padrão: o mês aberto. */
  para?: AnoMes;
  sobrescrever: boolean;
}

/** Erro de uma rota do v2 com a mensagem e o código que ela devolveu. */
export class ErroOrcamentoV2 extends Error {
  constructor(
    message: string,
    public status: number,
    public codigo?: string,
  ) {
    super(message);
    this.name = 'ErroOrcamentoV2';
  }
}

async function lerErro(res: Response, padrao: string): Promise<ErroOrcamentoV2> {
  const corpo = (await res.json().catch(() => null)) as { error?: string; codigo?: string } | null;
  return new ErroOrcamentoV2(corpo?.error ?? padrao, res.status, corpo?.codigo);
}

const BASE = '/api/cashflow/orcamento/v2';

/** Invalida o v2 todo, menos a chave aberta (que já recebeu a resposta do servidor). */
function invalidarOutrosV2(qc: QueryClient, aberta: QueryKey) {
  const h = hashKey(aberta);
  void qc.invalidateQueries({
    queryKey: queryKeys.cashflow.orcamentoV2Todos(),
    predicate: (q) => hashKey(q.queryKey) !== h,
  });
}

export function useOrcamentoV2(params: ParamsUseOrcamentoV2, opts: { enabled?: boolean } = {}) {
  const { ano, mes, fonte } = params;
  const visao = params.visao ?? 'mes';
  const queryClient = useQueryClient();
  const { csrfFetch } = useCsrf();
  const chave = queryKeys.cashflow.orcamentoV2(ano, mes, visao, fonte ?? 'padrao');

  const query = useQuery<OrcamentoV2Response>({
    queryKey: chave,
    enabled: opts.enabled ?? true,
    queryFn: async ({ signal }) => {
      const qs = new URLSearchParams({ ano: String(ano), mes: String(mes), visao });
      if (fonte) qs.set('fonte', fonte);
      const res = await fetch(`${BASE}?${qs.toString()}`, { credentials: 'include', signal });
      if (!res.ok) throw await lerErro(res, 'Erro ao buscar o orçamento');
      return res.json();
    },
  });

  const enviar = useCallback(
    async <T>(url: string, method: string, body: unknown, padrao: string): Promise<T> => {
      const res = await csrfFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw await lerErro(res, padrao);
      return (await res.json()) as T;
    },
    [csrfFetch],
  );

  /** Palpite otimista na chave aberta; devolve o payload anterior para o rollback. */
  const palpitar = async (
    aplicar: (d: OrcamentoV2Response) => OrcamentoV2Response,
  ): Promise<{ anterior: OrcamentoV2Response | undefined }> => {
    await queryClient.cancelQueries({ queryKey: chave });
    const anterior = queryClient.getQueryData<OrcamentoV2Response>(chave);
    if (anterior) queryClient.setQueryData<OrcamentoV2Response>(chave, aplicar(anterior));
    return { anterior };
  };
  const desfazerPalpite = (ctx: { anterior: OrcamentoV2Response | undefined } | undefined) => {
    if (ctx?.anterior) queryClient.setQueryData(chave, ctx.anterior);
  };
  const confirmar = (resposta: OrcadoEscritaResponse) => {
    queryClient.setQueryData<OrcamentoV2Response>(chave, (d) =>
      d ? aplicarRespostaEscrita(d, resposta) : d,
    );
    invalidarOutrosV2(queryClient, chave);
  };

  const salvarOrcado = useMutation<
    OrcadoEscritaResponse,
    ErroOrcamentoV2,
    SalvarOrcadoEntrada,
    { anterior: OrcamentoV2Response | undefined }
  >({
    mutationFn: (e) => {
      const corpo = 'pct' in e ? { pct: e.pct } : { valor: e.valor };
      return enviar<OrcadoEscritaResponse>(
        `${BASE}/subcategorias/${encodeURIComponent(e.itemId)}/orcado`,
        'PUT',
        { ano, mes, ...corpo, ...(fonte ? { fonte } : {}) },
        'Erro ao salvar o orçado',
      );
    },
    onMutate: (e) =>
      palpitar((d) =>
        aplicarOrcadoOtimista(
          d,
          e.itemId,
          'pct' in e
            ? { valor: null, pct: e.pct }
            : e.valor === null
              ? null
              : { valor: e.valor, pct: null },
        ),
      ),
    onError: (_err, _e, ctx) => desfazerPalpite(ctx),
    onSuccess: confirmar,
  });

  const marcarFixa = useMutation<
    OrcadoEscritaResponse,
    ErroOrcamentoV2,
    MarcarFixaEntrada,
    { anterior: OrcamentoV2Response | undefined }
  >({
    mutationFn: (e) =>
      enviar<OrcadoEscritaResponse>(
        `${BASE}/subcategorias/${encodeURIComponent(e.itemId)}`,
        'PATCH',
        { fixa: e.fixa, ano, mes, ...(fonte ? { fonte } : {}) },
        'Erro ao marcar a subcategoria',
      ),
    // `null` (padrão do catálogo) não tem palpite: o servidor conhece o padrão.
    onMutate: (e) =>
      palpitar((d) => (e.fixa === null ? d : aplicarNaSubcategoria(d, e.itemId, { fixa: e.fixa }))),
    onError: (_err, _e, ctx) => desfazerPalpite(ctx),
    onSuccess: confirmar,
  });

  const salvarPrefs = useMutation<
    PrefsEscritaResponse,
    ErroOrcamentoV2,
    PrefsEscritaBody,
    { anteriores: [QueryKey, OrcamentoV2Response | undefined][] }
  >({
    mutationFn: (prefs) =>
      enviar<PrefsEscritaResponse>(`${BASE}/prefs`, 'PUT', prefs, 'Erro ao salvar as preferências'),
    onMutate: async (prefs) => {
      const todos = queryKeys.cashflow.orcamentoV2Todos();
      await queryClient.cancelQueries({ queryKey: todos });
      const anteriores = queryClient.getQueriesData<OrcamentoV2Response>({ queryKey: todos });
      queryClient.setQueriesData<OrcamentoV2Response>({ queryKey: todos }, (d) =>
        d
          ? {
              ...d,
              prefs: {
                ...d.prefs,
                ...(prefs.categoriasRecolhidas !== undefined && {
                  categoriasRecolhidas: prefs.categoriasRecolhidas,
                }),
                ...(prefs.graficoVisivel !== undefined && {
                  graficoVisivel: prefs.graficoVisivel,
                }),
                ...(prefs.avisoGeralVisto !== undefined && {
                  avisoGeralPendente: !prefs.avisoGeralVisto,
                }),
              },
            }
          : d,
      );
      return { anteriores };
    },
    onError: (_err, _prefs, ctx) => {
      for (const [k, d] of ctx?.anteriores ?? []) queryClient.setQueryData(k, d);
    },
    onSuccess: (_r, prefs) => {
      // A fonte salva muda o payload das chaves 'padrao'.
      if (prefs.fonte !== undefined) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.orcamentoV2Todos() });
      }
    },
  });

  const copiarMes = useMutation<CopiarMesResponse, ErroOrcamentoV2, CopiarMesEntrada>({
    mutationFn: ({ de, para, sobrescrever }) =>
      enviar<CopiarMesResponse>(
        `${BASE}/copiar`,
        'POST',
        { de, para: para ?? { ano, mes }, sobrescrever },
        'Erro ao copiar o orçamento',
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.orcamentoV2Todos() });
    },
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: query.refetch,
    salvarOrcado,
    marcarFixa,
    salvarPrefs,
    copiarMes,
  };
}

export type UseOrcamentoV2 = ReturnType<typeof useOrcamentoV2>;
