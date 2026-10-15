'use client';

/**
 * Hooks dos modais da página do ativo (fatia C1, React Query):
 *  - useSugestoesComparar: GET comparar-sugestoes (queryKeys.analiseAtivos.sugestoesComparar);
 *  - usePosicaoCarteira: GET /api/ativos/[portfolioId] (modal "Ver na Carteira"; a mesma rota da
 *    tela /ativos/[id]) — key sob queryKeys.assets.all, que a invalidação da carteira já cobre;
 *  - useMutacoesCarteiraAnalise: v2.5 — salvarAlvo/removerAlvo (PUT/DELETE
 *    /api/analise-ativos/alvos/[ticker], planning_asset_targets, % da carteira TOTAL; NÃO toca o
 *    Objetivo da Carteira nem as rotas /objetivo e /planejados) e registrar (POST
 *    /api/carteira/operacao | /resgate), sempre com csrfFetch. O alvo atualiza o overlay da análise
 *    na hora (chip 'Planejado') e invalida o overlay; a operação chama
 *    invalidatePortfolioDerivedQueries (abas, resumo, Planejamento e o overlay da análise).
 * Erros das rotas chegam como ErroCarteira com a MENSAGEM REAL da rota (ex.: 'Campos obrigatórios:
 * tipoAtivo, instituicaoId', 'Instituição inválida para este investimento').
 */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';
import type {
  CorpoCompraOperacao,
  CorpoResgateVenda,
} from '@/services/analiseAtivos/regras/carteira/registroOperacao';
import type {
  AlvoDeleteResposta,
  AlvoPutResposta,
  OverlayCarteiraResposta,
} from '@/types/analiseAtivosApi';
import type { Janela, SugestoesCompararResposta } from '@/types/analiseAtivosCriterios';

/** Erro de uma rota da Carteira com a mensagem que ela devolveu. */
export class ErroCarteira extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface AlvoAtivoEntrada {
  ticker: string;
  /** % da carteira TOTAL (0 < x ≤ 100) */
  targetPct: number;
}

export interface MutacoesCarteiraAnalise {
  salvarAlvo: UseMutationResult<AlvoPutResposta, Error, AlvoAtivoEntrada>;
  removerAlvo: UseMutationResult<AlvoDeleteResposta, Error, string>;
  registrarCompra: UseMutationResult<void, Error, CorpoCompraOperacao>;
  registrarVenda: UseMutationResult<void, Error, CorpoResgateVenda>;
}

/** Resposta de GET /api/ativos/[portfolioId] (só os campos que o modal usa). */
export interface PosicaoCarteiraResposta {
  ativo: {
    nome: string;
    ticker: string;
    instituicao?: { id: string | null; nome: string | null } | null;
  };
  posicao: {
    quantidade: number;
    precoMedio: number;
    valorAplicado: number;
    saldoBruto: number;
    rentabilidade: number;
    resultado: number;
    proventosRecebidos: number;
    cotacaoAtual: number;
  };
  transacoes: Array<{
    id: string;
    tipoOperacao: string;
    quantity: number;
    price: number;
    total: number;
    date: string;
    notes?: string | null;
  }>;
}

async function lerErro(res: Response, padrao: string): Promise<ErroCarteira> {
  const corpo = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
  return new ErroCarteira(
    corpo?.error ?? corpo?.message ?? `${padrao} (${res.status})`,
    res.status,
  );
}

async function getJson<T>(url: string, padrao: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: 'include', signal });
  if (!res.ok) throw await lerErro(res, padrao);
  return (await res.json()) as T;
}

export function useSugestoesComparar(
  ticker: string,
  janela: Janela,
  q: string,
  habilitado: boolean,
): UseQueryResult<SugestoesCompararResposta> {
  const t = ticker.toUpperCase();
  const busca = q.trim();
  return useQuery<SugestoesCompararResposta>({
    queryKey: queryKeys.analiseAtivos.sugestoesComparar(t, janela, busca),
    enabled: habilitado && t.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: (falhas, erro) =>
      !(erro instanceof ErroCarteira && erro.status >= 400 && erro.status < 500) && falhas < 2,
    queryFn: ({ signal }) => {
      const qs = new URLSearchParams({ janela: String(janela) });
      if (busca) qs.set('q', busca);
      return getJson(
        `/api/analise-ativos/ativos/${encodeURIComponent(t)}/comparar-sugestoes?${qs}`,
        'Erro ao carregar as sugestões',
        signal,
      );
    },
  });
}

export const chavePosicaoCarteira = (portfolioId: string) =>
  [...queryKeys.assets.all, 'detalhe', portfolioId] as const;

export function usePosicaoCarteira(
  portfolioId: string | null,
  habilitado: boolean,
): UseQueryResult<PosicaoCarteiraResposta> {
  return useQuery<PosicaoCarteiraResposta>({
    queryKey: chavePosicaoCarteira(portfolioId ?? ''),
    enabled: habilitado && !!portfolioId,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      getJson(
        `/api/ativos/${encodeURIComponent(portfolioId as string)}`,
        'Erro ao carregar a posição',
        signal,
      ),
  });
}

/** URL da rota do alvo por ativo. */
export const urlAlvo = (ticker: string) =>
  `/api/analise-ativos/alvos/${encodeURIComponent(ticker.trim().toUpperCase())}`;

/** Aplica o alvo gravado/removido no overlay em cache (o chip 'Planejado' muda na hora). */
export function aplicarAlvoNoOverlay(
  overlay: OverlayCarteiraResposta | undefined,
  ticker: string,
  alvo: AlvoPutResposta['alvo'] | null,
): OverlayCarteiraResposta | undefined {
  if (!overlay) return overlay;
  const t = ticker.toUpperCase();
  const alvos = { ...(overlay.alvos ?? {}) };
  if (alvo) alvos[t] = alvo;
  else delete alvos[t];
  return { ...overlay, alvos };
}

export function useMutacoesCarteiraAnalise(): MutacoesCarteiraAnalise {
  const qc = useQueryClient();
  const { csrfFetch } = useCsrf();

  const enviar = async <T = void>(
    url: string,
    method: string,
    body: unknown,
    padrao: string,
  ): Promise<T> => {
    const res = await csrfFetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw await lerErro(res, padrao);
    return (await res.json().catch(() => undefined)) as T;
  };
  const aoConcluir = () => invalidatePortfolioDerivedQueries(qc);
  const aoMudarAlvo = (ticker: string, alvo: AlvoPutResposta['alvo'] | null) => {
    qc.setQueryData<OverlayCarteiraResposta>(queryKeys.analiseAtivos.carteira(), (o) =>
      aplicarAlvoNoOverlay(o, ticker, alvo),
    );
    void qc.invalidateQueries({ queryKey: queryKeys.analiseAtivos.carteira() });
  };

  const salvarAlvo = useMutation<AlvoPutResposta, Error, AlvoAtivoEntrada>({
    mutationFn: ({ ticker, targetPct }) =>
      enviar<AlvoPutResposta>(urlAlvo(ticker), 'PUT', { targetPct }, 'Erro ao salvar o alvo'),
    onSuccess: (r, e) => aoMudarAlvo(e.ticker, r.alvo),
  });
  const removerAlvo = useMutation<AlvoDeleteResposta, Error, string>({
    mutationFn: (ticker) =>
      enviar<AlvoDeleteResposta>(urlAlvo(ticker), 'DELETE', undefined, 'Erro ao remover o alvo'),
    onSuccess: (_r, ticker) => aoMudarAlvo(ticker, null),
  });
  const registrarCompra = useMutation<void, Error, CorpoCompraOperacao>({
    mutationFn: async (corpo) => {
      await enviar('/api/carteira/operacao', 'POST', corpo, 'Erro ao registrar a operação');
    },
    onSuccess: aoConcluir,
  });
  const registrarVenda = useMutation<void, Error, CorpoResgateVenda>({
    mutationFn: async (corpo) => {
      await enviar('/api/carteira/resgate', 'POST', corpo, 'Erro ao registrar a operação');
    },
    onSuccess: aoConcluir,
  });

  return { salvarAlvo, removerAlvo, registrarCompra, registrarVenda };
}
