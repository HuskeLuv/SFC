'use client';

/**
 * Hooks React Query do bloco 1 da Análise de Ativos (dono: fatia 0; tipos em
 * src/types/analiseAtivosSalvos.ts, rotas em ROTAS_SALVOS, keys em queryKeys.analiseAtivos).
 * Tudo com credentials:'include'; mutações com csrfFetch. NENHUM invalida a Carteira (listas,
 * filtros e comparações não mexem em posição).
 *
 * - Listas: useListas, useLinhasLista (placeholderData = anterior: trocar classe/ordem não pisca),
 *   useCriarLista, useRenomearLista, useApagarLista, useAtualizarAlertasLista.
 * - Botão Salvar: useIndiceSalvos (5 min) + useDefinirSalvo (OTIMISTA no índice, reverte em erro,
 *   invalida listas e o índice no fim). A regra do clique é acaoDoSalvar (contrato).
 * - Itens: useAdicionarItem (também o Desfazer do "removido"), useRemoverItem.
 * - Filtros salvos: useFiltrosSalvos, useCriarFiltro, useAtualizarFiltro, useApagarFiltro,
 *   useMarcarUsoFiltro (silencioso).
 * - Comparações salvas: useComparacoesSalvas, useSalvarComparacao, useRenomearComparacao,
 *   useApagarComparacao.
 * - Avisos: useAlertas, useMarcarAlertasLidos (invalida também o sino).
 * - PDF: baixarPdfComparacao — fetch → blob → File; no celular, navigator.share quando
 *   canShare({files}) (no computador, sempre download); no
 *   iOS, NotAllowedError depois do await (ativação expirada) devolve {estado:'compartilhar'} com o
 *   arquivo guardado (o botão vira "Compartilhar PDF"; o 2º toque chama compartilhar()). Senão,
 *   <a download>. AbortError (o usuário fechou o menu) não é erro.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { ErroAnalise, retryAnalise } from '@/hooks/useAnaliseAtivos';
import { nomeDoContentDisposition } from '@/hooks/useAnaliseAtivosBlocoD';
import { NOTIFICATIONS_QUERY_KEY } from '@/hooks/useNotifications';
import { queryKeys } from '@/lib/queryKeys';
import {
  ROTAS_SALVOS,
  SENTINELA_PADRAO,
  nomeArquivoPdf,
  urlPdfComparacao,
} from '@/services/analiseAtivos/salvos/contrato';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';
import type {
  AlertasLidosBody,
  AlertasLidosResposta,
  AlertasLista,
  AlertasResposta,
  ComparacaoPdfParams,
  ComparacaoPostBody,
  ComparacaoPostResposta,
  ComparacaoSalvaApi,
  ComparacoesResposta,
  FiltroPatchBody,
  FiltroPostBody,
  FiltroSalvoApi,
  FiltrosResposta,
  IndiceSalvosResposta,
  ItemPostResposta,
  LinhasListaParams,
  LinhasListaResposta,
  ListaPostBody,
  ListasResposta,
  OkResposta,
  ResultadoPdfComparacao,
  ResumoLista,
  SalvosPutResposta,
} from '@/types/analiseAtivosSalvos';

const MIN = 60_000;

export const TEMPOS_SALVOS = {
  listas: MIN,
  lista: MIN,
  indice: 5 * MIN,
  filtros: 5 * MIN,
  comparacoes: 5 * MIN,
  alertas: MIN,
} as const;

const K = queryKeys.analiseAtivos;

async function erroDaResposta(res: Response, padrao: string): Promise<ErroAnalise> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return new ErroAnalise(body?.error ?? `${padrao} (${res.status})`, res.status);
}

async function getJson<T>(url: string, padrao: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: 'include', signal });
  if (!res.ok) throw await erroDaResposta(res, padrao);
  return (await res.json()) as T;
}

type CsrfFetch = ReturnType<typeof useCsrf>['csrfFetch'];

async function enviar<T>(
  csrfFetch: CsrfFetch,
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  padrao: string,
  body?: unknown,
): Promise<T> {
  const res = await csrfFetch(url, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!res.ok) throw await erroDaResposta(res, padrao);
  return (await res.json().catch(() => ({ ok: true }))) as T;
}

function query(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** Listas + índice do Salvar + linhas das listas (o que muda quando uma lista ou item muda). */
function invalidarListas(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: K.listas() });
  void qc.invalidateQueries({ queryKey: K.salvosIndice() });
}

// ---------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------

export function useListas(opts: { enabled?: boolean } = {}) {
  return useQuery<ListasResposta, Error>({
    queryKey: K.listas(),
    staleTime: TEMPOS_SALVOS.listas,
    retry: retryAnalise,
    enabled: opts.enabled ?? true,
    queryFn: ({ signal }) => getJson(ROTAS_SALVOS.api.listas, 'Erro ao carregar as listas', signal),
  });
}

/** Linhas de uma lista na classe (mesmas colunas do Quadro + Adicionado em). */
export function useLinhasLista(
  id: string | null,
  params: LinhasListaParams,
  opts: { enabled?: boolean } = {},
) {
  const p = {
    classe: params.classe,
    janela: params.janela,
    ordem: params.ordem,
    dir: params.dir,
    modo: params.modo,
  };
  return useQuery<LinhasListaResposta, Error>({
    queryKey: K.lista(id ?? '', p),
    staleTime: TEMPOS_SALVOS.lista,
    retry: retryAnalise,
    placeholderData: keepPreviousData,
    enabled: (opts.enabled ?? true) && !!id,
    queryFn: ({ signal }) =>
      getJson(`${ROTAS_SALVOS.api.lista(id ?? '')}${query(p)}`, 'Erro ao carregar a lista', signal),
  });
}

export function useCriarLista() {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<ResumoLista, Error, ListaPostBody>({
    mutationFn: (body) =>
      enviar(csrfFetch, ROTAS_SALVOS.api.listas, 'POST', 'Erro ao criar a lista', body),
    onSuccess: () => invalidarListas(qc),
  });
}

export function useRenomearLista() {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<ResumoLista, Error, { id: string; nome: string }>({
    mutationFn: ({ id, nome }) =>
      enviar(csrfFetch, ROTAS_SALVOS.api.lista(id), 'PATCH', 'Erro ao renomear a lista', { nome }),
    onSuccess: () => invalidarListas(qc),
  });
}

export function useApagarLista() {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<OkResposta, Error, { id: string }>({
    mutationFn: ({ id }) =>
      enviar(csrfFetch, ROTAS_SALVOS.api.lista(id), 'DELETE', 'Erro ao apagar a lista'),
    onSuccess: () => invalidarListas(qc),
  });
}

/** PATCH dos 3 avisos de uma lista ("Alertas da lista", fatia D). */
export function useAtualizarAlertasLista() {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<ResumoLista, Error, { id: string; alertas: Partial<AlertasLista> }>({
    mutationFn: ({ id, alertas }) =>
      enviar(csrfFetch, ROTAS_SALVOS.api.lista(id), 'PATCH', 'Erro ao salvar os alertas', {
        alertas,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: K.listas() }),
  });
}

// ---------------------------------------------------------------------------
// Botão Salvar (índice + PUT)
// ---------------------------------------------------------------------------

export function useIndiceSalvos(opts: { enabled?: boolean } = {}) {
  return useQuery<IndiceSalvosResposta, Error>({
    queryKey: K.salvosIndice(),
    staleTime: TEMPOS_SALVOS.indice,
    retry: retryAnalise,
    enabled: opts.enabled ?? true,
    queryFn: ({ signal }) => getJson(ROTAS_SALVOS.api.salvos, 'Erro ao carregar os salvos', signal),
  });
}

/** Id provisório no índice enquanto o sentinela cria a 1ª lista ('Salvos'). */
export const ID_LISTA_PROVISORIA = '__nova__';

/** Pertença otimista: o sentinela vira a lista única (1 lista) ou a provisória (0 listas). */
export function pertencaOtimista(
  indice: IndiceSalvosResposta | undefined,
  listaIds: readonly string[],
): string[] {
  if (listaIds.length === 1 && listaIds[0] === SENTINELA_PADRAO) {
    const listas = indice?.listas ?? [];
    return listas.length === 1 ? [listas[0].id] : [ID_LISTA_PROVISORIA];
  }
  return [...listaIds];
}

function comPertenca(
  indice: IndiceSalvosResposta,
  ticker: string,
  listaIds: readonly string[],
): IndiceSalvosResposta {
  const porTicker = { ...indice.porTicker };
  if (listaIds.length) porTicker[ticker] = [...listaIds];
  else delete porTicker[ticker];
  return { ...indice, porTicker };
}

/**
 * PUT /salvos/[ticker] com listaIds explícitos, [] (tira de todas) ou [SENTINELA_PADRAO] (0 listas
 * → cria 'Salvos'; 1 → a única). Otimista no índice; reverte em erro.
 */
export function useDefinirSalvo() {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<
    SalvosPutResposta,
    Error,
    { ticker: string; listaIds: string[] },
    { anterior: IndiceSalvosResposta | undefined }
  >({
    mutationFn: ({ ticker, listaIds }) =>
      enviar(csrfFetch, ROTAS_SALVOS.api.salvo(ticker), 'PUT', 'Erro ao salvar o ativo', {
        listaIds,
      }),
    onMutate: async ({ ticker, listaIds }) => {
      await qc.cancelQueries({ queryKey: K.salvosIndice() });
      const anterior = qc.getQueryData<IndiceSalvosResposta>(K.salvosIndice());
      if (anterior) {
        qc.setQueryData(
          K.salvosIndice(),
          comPertenca(anterior, ticker, pertencaOtimista(anterior, listaIds)),
        );
      }
      return { anterior };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(K.salvosIndice(), ctx.anterior);
    },
    onSuccess: (r) => {
      const atual = qc.getQueryData<IndiceSalvosResposta>(K.salvosIndice());
      if (atual) {
        const listas = r.listaCriada ? [...atual.listas, r.listaCriada] : atual.listas;
        qc.setQueryData(K.salvosIndice(), { ...comPertenca(atual, r.ticker, r.listaIds), listas });
      }
    },
    onSettled: () => invalidarListas(qc),
  });
}

// ---------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------

/** POST /listas/[id]/itens (idempotente: 200 se já estava; usado no Desfazer). */
export function useAdicionarItem() {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<ItemPostResposta, Error, { listaId: string; ticker: string }>({
    mutationFn: ({ listaId, ticker }) =>
      enviar(csrfFetch, ROTAS_SALVOS.api.itens(listaId), 'POST', 'Erro ao salvar o ativo', {
        ticker,
      }),
    onSettled: () => invalidarListas(qc),
  });
}

/** DELETE /listas/[id]/itens/[ticker] (idempotente; o "×" da tabela Salvos). */
export function useRemoverItem() {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<OkResposta, Error, { listaId: string; ticker: string }>({
    mutationFn: ({ listaId, ticker }) =>
      enviar(csrfFetch, ROTAS_SALVOS.api.item(listaId, ticker), 'DELETE', 'Erro ao remover'),
    onSettled: () => invalidarListas(qc),
  });
}

// ---------------------------------------------------------------------------
// Filtros salvos
// ---------------------------------------------------------------------------

export function useFiltrosSalvos(classe: ClasseQuadro, opts: { enabled?: boolean } = {}) {
  return useQuery<FiltrosResposta, Error>({
    queryKey: K.filtros(classe),
    staleTime: TEMPOS_SALVOS.filtros,
    retry: retryAnalise,
    enabled: opts.enabled ?? true,
    queryFn: ({ signal }) =>
      getJson(
        `${ROTAS_SALVOS.api.filtros}${query({ classe })}`,
        'Erro ao carregar os filtros salvos',
        signal,
      ),
  });
}

const invalidarFiltros = (qc: QueryClient) =>
  void qc.invalidateQueries({ queryKey: [...K.salvosTodos(), 'filtros'] });

export function useCriarFiltro() {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<FiltroSalvoApi, Error, FiltroPostBody>({
    mutationFn: (body) =>
      enviar(csrfFetch, ROTAS_SALVOS.api.filtros, 'POST', 'Erro ao salvar o filtro', body),
    onSuccess: () => invalidarFiltros(qc),
  });
}

/** "Salvar alterações" (estado), renomear ou "Substituir" (PATCH no existente). */
export function useAtualizarFiltro() {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<FiltroSalvoApi, Error, { id: string } & FiltroPatchBody>({
    mutationFn: ({ id, ...body }) =>
      enviar(csrfFetch, ROTAS_SALVOS.api.filtro(id), 'PATCH', 'Erro ao salvar o filtro', body),
    onSuccess: () => invalidarFiltros(qc),
  });
}

export function useApagarFiltro() {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<OkResposta, Error, { id: string }>({
    mutationFn: ({ id }) =>
      enviar(csrfFetch, ROTAS_SALVOS.api.filtro(id), 'DELETE', 'Erro ao apagar o filtro'),
    onSuccess: () => invalidarFiltros(qc),
  });
}

/** PATCH {usado:true} ao aplicar ?filtro=<id> (silencioso: não invalida nem mostra erro). */
export function useMarcarUsoFiltro() {
  const { csrfFetch } = useCsrf();
  return useMutation<FiltroSalvoApi, Error, { id: string }>({
    mutationFn: ({ id }) =>
      enviar(csrfFetch, ROTAS_SALVOS.api.filtro(id), 'PATCH', 'Erro ao marcar o filtro', {
        usado: true,
      }),
  });
}

// ---------------------------------------------------------------------------
// Comparações salvas
// ---------------------------------------------------------------------------

export function useComparacoesSalvas(classe?: ClasseQuadro, opts: { enabled?: boolean } = {}) {
  return useQuery<ComparacoesResposta, Error>({
    queryKey: K.comparacoes(classe),
    staleTime: TEMPOS_SALVOS.comparacoes,
    retry: retryAnalise,
    enabled: opts.enabled ?? true,
    queryFn: ({ signal }) =>
      getJson(
        `${ROTAS_SALVOS.api.comparacoes}${query({ classe })}`,
        'Erro ao carregar as comparações salvas',
        signal,
      ),
  });
}

const invalidarComparacoes = (qc: QueryClient) =>
  void qc.invalidateQueries({ queryKey: [...K.salvosTodos(), 'comparacoes'] });

/** 201 = nova; 200 {atualizada:true} = a mesma combinação (chaveComparacao) foi atualizada. */
export function useSalvarComparacao() {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<ComparacaoPostResposta, Error, ComparacaoPostBody>({
    mutationFn: (body) =>
      enviar(csrfFetch, ROTAS_SALVOS.api.comparacoes, 'POST', 'Erro ao salvar a comparação', body),
    onSuccess: () => invalidarComparacoes(qc),
  });
}

export function useRenomearComparacao() {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<ComparacaoSalvaApi, Error, { id: string; nome: string }>({
    mutationFn: ({ id, nome }) =>
      enviar(csrfFetch, ROTAS_SALVOS.api.comparacao(id), 'PATCH', 'Erro ao renomear', { nome }),
    onSuccess: () => invalidarComparacoes(qc),
  });
}

export function useApagarComparacao() {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<OkResposta, Error, { id: string }>({
    mutationFn: ({ id }) =>
      enviar(csrfFetch, ROTAS_SALVOS.api.comparacao(id), 'DELETE', 'Erro ao apagar a comparação'),
    onSuccess: () => invalidarComparacoes(qc),
  });
}

// ---------------------------------------------------------------------------
// Avisos das listas
// ---------------------------------------------------------------------------

export function useAlertas(classe?: ClasseQuadro, opts: { enabled?: boolean } = {}) {
  return useQuery<AlertasResposta, Error>({
    queryKey: K.alertas(classe),
    staleTime: TEMPOS_SALVOS.alertas,
    retry: retryAnalise,
    enabled: opts.enabled ?? true,
    queryFn: ({ signal }) =>
      getJson(
        `${ROTAS_SALVOS.api.alertas}${query({ classe })}`,
        'Erro ao carregar os alertas',
        signal,
      ),
  });
}

/** POST /alertas/lidos (ids ausente = todos os 90 dias); invalida a aba e o sino. */
export function useMarcarAlertasLidos() {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<AlertasLidosResposta, Error, AlertasLidosBody>({
    mutationFn: (body) =>
      enviar(csrfFetch, ROTAS_SALVOS.api.alertasLidos, 'POST', 'Erro ao marcar como lidos', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...K.salvosTodos(), 'alertas'] });
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// PDF do Comparador
// ---------------------------------------------------------------------------

function hojeLocalIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function ehErroNomeado(e: unknown, nome: string): boolean {
  return (
    typeof e === 'object' && e !== null && 'name' in e && (e as { name: unknown }).name === nome
  );
}

/** Celular (iOS/iPadOS ou Android): lá o PDF vai pelo menu de compartilhar do aparelho. */
function ehCelular(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod|Android/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** share() que engole o AbortError (o usuário fechou o menu de compartilhar). */
async function compartilharArquivo(arquivo: File, nome: string): Promise<void> {
  try {
    await navigator.share({ files: [arquivo], title: nome });
  } catch (e: unknown) {
    if (!ehErroNomeado(e, 'AbortError')) throw e;
  }
}

/**
 * Baixa o PDF da comparação. Resolve com {estado:'baixado'} ou, no iOS quando o share depois do
 * await lança NotAllowedError, com {estado:'compartilhar', compartilhar} (2º toque, ativação
 * nova). Rejeita com ErroAnalise em 4xx/5xx (429 = limite de 10 por hora) ou falha de rede.
 */
export async function baixarPdfComparacao(
  params: ComparacaoPdfParams & { classe: ClasseQuadro },
): Promise<ResultadoPdfComparacao> {
  const res = await fetch(urlPdfComparacao(params.tickers, params.janela, params.tipoFii), {
    credentials: 'include',
  });
  if (!res.ok) throw await erroDaResposta(res, 'Erro ao gerar o PDF');
  const blob = await res.blob();
  const nome =
    nomeDoContentDisposition(res.headers.get('Content-Disposition')) ??
    nomeArquivoPdf(params.classe, params.tickers, hojeLocalIso());

  if (typeof File !== 'undefined' && ehCelular()) {
    const arquivo = new File([blob], nome, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [arquivo] })) {
      try {
        await compartilharArquivo(arquivo, nome);
        return { estado: 'baixado', nome };
      } catch (e: unknown) {
        if (ehErroNomeado(e, 'NotAllowedError')) {
          return {
            estado: 'compartilhar',
            nome,
            compartilhar: () => compartilharArquivo(arquivo, nome),
          };
        }
        throw e;
      }
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
  return { estado: 'baixado', nome };
}
