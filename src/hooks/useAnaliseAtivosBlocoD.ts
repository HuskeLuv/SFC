'use client';

/**
 * Hooks React Query do Bloco D da Análise de Ativos (dono: fatia 0; contratos em
 * src/types/analiseAtivosBlocoD.ts, rotas em ROTAS_BLOCO_D, keys em queryKeys.analiseAtivos).
 *
 * - useRaioX(ticker, {enabled}): 30 min, retryAnalise (fatia A). Só com config.recursos.raioX.
 * - baixarCsvRaioX(ticker): GET ?formato=csv (credentials same-origin) → blob; nome do arquivo do
 *   Content-Disposition (fallback raio-x_<TICKER>_<hoje>.csv, decisão 13). No PWA instalado do iOS
 *   (download por blob instável) usa navigator.share({files}) quando canShare permite; senão um
 *   <a download> com object URL. Devolve uma Promise (spinner + toast com o nome).
 * - useCenarios(ticker, {enabled}): staleTime 0, sem refetchOnWindowFocus (não sobrescrever o que
 *   está sendo digitado) (fatia B).
 * - useSalvarCenario / useApagarCenario: csrfFetch PUT/DELETE + setQueryData no cache do cenário
 *   (não mexe na carteira). O "Desfazer" do restaurar regrava com useSalvarCenario.
 * - useComparador(tickers, {enabled}): chave com os tickers ORDENADOS (+ o 1º slot, que decide a
 *   classe), 10 min, placeholderData = resposta anterior (trocar um slot não pisca); o pedido vai
 *   na ordem dos slots e `select` reordena a resposta (vinda do cache) pelos slots (fatia C).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { ErroAnalise, TEMPOS_ANALISE, retryAnalise } from '@/hooks/useAnaliseAtivos';
import { queryKeys } from '@/lib/queryKeys';
import { ROTAS_BLOCO_D, nomeArquivoCsvRaioX } from '@/services/analiseAtivos/cenarios/contrato';
import type {
  CenarioDeleteResposta,
  CenarioPutBody,
  CenarioPutResposta,
  CenariosResposta,
  ComparadorResposta,
  RaioXResposta,
} from '@/types/analiseAtivosBlocoD';

export const TEMPOS_BLOCO_D = {
  raioX: TEMPOS_ANALISE.analise,
  comparador: TEMPOS_ANALISE.ativo,
} as const;

async function erroDaResposta(res: Response, padrao: string): Promise<ErroAnalise> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return new ErroAnalise(body?.error ?? `${padrao} (${res.status})`, res.status);
}

async function getJson<T>(url: string, padrao: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: 'include', signal });
  if (!res.ok) throw await erroDaResposta(res, padrao);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Raio-X (fatia A)
// ---------------------------------------------------------------------------

export function useRaioX(ticker: string, opts: { enabled?: boolean } = {}) {
  return useQuery<RaioXResposta, Error>({
    queryKey: queryKeys.analiseAtivos.raioX(ticker),
    staleTime: TEMPOS_BLOCO_D.raioX,
    retry: retryAnalise,
    enabled: (opts.enabled ?? true) && ticker.length > 0,
    queryFn: ({ signal }) =>
      getJson(ROTAS_BLOCO_D.api.raioX(ticker), 'Erro ao carregar o Raio-X', signal),
  });
}

/** Nome do arquivo no Content-Disposition (filename*=UTF-8'' ou filename="..."), ou null. */
export function nomeDoContentDisposition(cabecalho: string | null): string | null {
  if (!cabecalho) return null;
  const estendido = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(cabecalho);
  if (estendido) {
    try {
      return decodeURIComponent(estendido[1].trim());
    } catch {
      // cai no filename simples
    }
  }
  const simples = /filename\s*=\s*"?([^";]+)"?/i.exec(cabecalho);
  return simples ? simples[1].trim() : null;
}

function hojeLocalIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function pwaIosInstalado(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true;
  return ios && standalone;
}

/**
 * Baixa o CSV do Raio-X. Resolve com o nome do arquivo (para o toast); rejeita com ErroAnalise
 * (o botão mostra o erro com "Tentar de novo"). Cancelar o share do iOS NÃO é erro.
 */
export async function baixarCsvRaioX(ticker: string): Promise<{ nome: string }> {
  const res = await fetch(ROTAS_BLOCO_D.api.raioXCsv(ticker), { credentials: 'same-origin' });
  if (!res.ok) throw await erroDaResposta(res, 'Erro ao gerar o CSV');
  const blob = await res.blob();
  const nome =
    nomeDoContentDisposition(res.headers.get('Content-Disposition')) ??
    nomeArquivoCsvRaioX(ticker, hojeLocalIso());

  if (pwaIosInstalado() && typeof File !== 'undefined') {
    const arquivo = new File([blob], nome, { type: 'text/csv' });
    if (navigator.canShare?.({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: nome });
      } catch (e: unknown) {
        if (!(e instanceof Error && e.name === 'AbortError')) throw e;
      }
      return { nome };
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
  return { nome };
}

// ---------------------------------------------------------------------------
// Meus cenários (fatia B)
// ---------------------------------------------------------------------------

export function useCenarios(ticker: string, opts: { enabled?: boolean } = {}) {
  return useQuery<CenariosResposta, Error>({
    queryKey: queryKeys.analiseAtivos.cenario(ticker),
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: retryAnalise,
    enabled: (opts.enabled ?? true) && ticker.length > 0,
    queryFn: ({ signal }) =>
      getJson(ROTAS_BLOCO_D.api.cenarios(ticker), 'Erro ao carregar os cenários', signal),
  });
}

/** PUT do cenário; no sucesso grava premissas + dadosEditados + atualizadoEm no cache. */
export function useSalvarCenario(ticker: string) {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<CenarioPutResposta, Error, CenarioPutBody>({
    mutationFn: async (body) => {
      const res = await csrfFetch(ROTAS_BLOCO_D.api.cenarios(ticker), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw await erroDaResposta(res, 'Erro ao salvar o cenário');
      return (await res.json()) as CenarioPutResposta;
    },
    onSuccess: (r, body) => {
      qc.setQueryData<CenariosResposta>(queryKeys.analiseAtivos.cenario(ticker), (atual) => {
        if (!atual || atual.classe !== body.classe) return atual;
        const salvo = {
          premissas: body.premissas,
          dadosEditados: body.dados && Object.keys(body.dados).length > 0 ? body.dados : null,
          atualizadoEm: r.atualizadoEm,
        };
        return { ...atual, salvo } as CenariosResposta;
      });
    },
  });
}

/** DELETE do cenário ("Restaurar valores do ativo"); no sucesso zera o salvo no cache. */
export function useApagarCenario(ticker: string) {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<CenarioDeleteResposta, Error, void>({
    mutationFn: async () => {
      const res = await csrfFetch(ROTAS_BLOCO_D.api.cenarios(ticker), { method: 'DELETE' });
      if (!res.ok) throw await erroDaResposta(res, 'Erro ao restaurar o cenário');
      return (await res.json().catch(() => ({ ok: true }))) as CenarioDeleteResposta;
    },
    onSuccess: () => {
      qc.setQueryData<CenariosResposta>(queryKeys.analiseAtivos.cenario(ticker), (atual) =>
        atual ? ({ ...atual, salvo: null } as CenariosResposta) : atual,
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Comparador (fatia C)
// ---------------------------------------------------------------------------

/**
 * Reordena a resposta pela ordem dos slots (o cache é por conjunto ordenado). Tickers que não
 * estão em `slots` (não deveria acontecer) vão para o fim, na ordem em que vieram.
 */
export function ordenarComparadorPelosSlots(
  resp: ComparadorResposta,
  slots: readonly string[],
): ComparadorResposta {
  const pos = new Map(slots.map((t, i) => [t, i]));
  const chave = (t: string) => pos.get(t) ?? Number.MAX_SAFE_INTEGER;
  const ordenar = <T>(lista: T[], ticker: (x: T) => string): T[] =>
    lista
      .map((x, i) => ({ x, i }))
      .sort((a, b) => chave(ticker(a.x)) - chave(ticker(b.x)) || a.i - b.i)
      .map(({ x }) => x);
  return {
    ...resp,
    tickers: ordenar(resp.tickers, (t) => t),
    ativos: ordenar(resp.ativos, (a) => a.ticker),
    graficos: resp.graficos
      ? { ...resp.graficos, series: ordenar(resp.graficos.series, (s) => s.ticker) }
      : null,
    resumo: {
      ...resp.resumo,
      indices: ordenar(resp.resumo.indices, (x) => x.ticker),
      criteriosAtendidos: ordenar(resp.resumo.criteriosAtendidos, (x) => x.ticker),
      emConferencia: ordenar(resp.resumo.emConferencia, (x) => x.ticker),
    },
  };
}

export function useComparador(tickers: readonly string[], opts: { enabled?: boolean } = {}) {
  const ordenados = [...tickers].sort();
  return useQuery<ComparadorResposta, Error>({
    queryKey: queryKeys.analiseAtivos.comparador(ordenados, tickers[0] ?? ''),
    staleTime: TEMPOS_BLOCO_D.comparador,
    placeholderData: keepPreviousData,
    retry: retryAnalise,
    enabled: (opts.enabled ?? true) && tickers.length > 0,
    // pede na ordem dos slots: a classe da comparação é a do 1º ticker válido
    queryFn: ({ signal }) =>
      getJson(ROTAS_BLOCO_D.api.comparador(tickers), 'Erro ao carregar a comparação', signal),
    select: (resp) => ordenarComparadorPelosSlots(resp, tickers),
  });
}
