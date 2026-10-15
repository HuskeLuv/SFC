'use client';

/**
 * Hooks dos modais da página do ativo (fatia C1, React Query):
 *  - useSugestoesComparar: GET comparar-sugestoes (queryKeys.analiseAtivos.sugestoesComparar);
 *  - usePosicaoCarteira: GET /api/ativos/[portfolioId] (modal "Ver na Carteira"; a mesma rota da
 *    tela /ativos/[id]) — key sob queryKeys.assets.all, que a invalidação da carteira já cobre;
 *  - useMutacoesCarteiraAnalise: planejar (POST /api/carteira/planejados, PATCH/DELETE
 *    /api/carteira/planejados/[id] ou POST /api/carteira/<aba>/objetivo) e registrar (POST
 *    /api/carteira/operacao | /resgate), sempre com csrfFetch e, no sucesso,
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
import type { ClasseQuadro } from '@/types/analiseAtivosApi';
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

/** Aba da Carteira → segmento da rota (/api/carteira/<segmento>/objetivo). */
const ROTA_ABA: Record<string, string> = {
  acoes: 'acoes',
  fiis: 'fii',
  stocks: 'stocks',
  etfs: 'etf',
  reits: 'reit',
  fimFia: 'fim-fia',
};

/** Onde o alvo é gravado (sempre o Objetivo que JÁ existe, % dentro da aba — rec. 1). */
export type AlvoPlano =
  | { tipo: 'posicao'; portfolioId: string; categoria: string }
  | { tipo: 'planejado'; watchlistId: string }
  | { tipo: 'novo'; assetId: string; classe: ClasseQuadro; secao: string | null };

export interface PlanoAlvoEntrada {
  ticker: string;
  /** % DENTRO da aba; null/0 = remover do plano */
  objetivoPct: number | null;
  alvo: AlvoPlano;
}

export interface MutacoesCarteiraAnalise {
  salvarPlano: UseMutationResult<void, Error, PlanoAlvoEntrada>;
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

/** Requisição de UMA etapa do plano (exportada para teste). */
export function requisicaoPlano(e: PlanoAlvoEntrada): {
  url: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
} | null {
  const pct = e.objetivoPct !== null && e.objetivoPct > 0 ? e.objetivoPct : null;
  const { alvo } = e;
  if (alvo.tipo === 'posicao') {
    const aba = ROTA_ABA[alvo.categoria] ?? 'acoes';
    return {
      url: `/api/carteira/${aba}/objetivo`,
      method: 'POST',
      body: { ativoId: alvo.portfolioId, objetivo: pct ?? 0 },
    };
  }
  if (alvo.tipo === 'planejado') {
    const url = `/api/carteira/planejados/${encodeURIComponent(alvo.watchlistId)}`;
    return pct === null
      ? { url, method: 'DELETE' }
      : { url, method: 'PATCH', body: { objetivo: pct } };
  }
  if (pct === null) return null; // nada planejado e nada a gravar
  return {
    url: '/api/carteira/planejados',
    method: 'POST',
    body: {
      assetId: alvo.assetId,
      tipoAtivo: alvo.classe === 'fii' ? 'fii' : 'acao',
      ...(alvo.secao ? { secao: alvo.secao } : {}),
      objetivo: pct,
    },
  };
}

export function useMutacoesCarteiraAnalise(): MutacoesCarteiraAnalise {
  const qc = useQueryClient();
  const { csrfFetch } = useCsrf();

  const enviar = async (url: string, method: string, body: unknown, padrao: string) => {
    const res = await csrfFetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw await lerErro(res, padrao);
  };
  const aoConcluir = () => invalidatePortfolioDerivedQueries(qc);

  const salvarPlano = useMutation<void, Error, PlanoAlvoEntrada>({
    mutationFn: async (e) => {
      const r = requisicaoPlano(e);
      if (!r) return;
      await enviar(r.url, r.method, r.body, 'Erro ao salvar o alvo');
    },
    onSuccess: aoConcluir,
  });
  const registrarCompra = useMutation<void, Error, CorpoCompraOperacao>({
    mutationFn: (corpo) =>
      enviar('/api/carteira/operacao', 'POST', corpo, 'Erro ao registrar a operação'),
    onSuccess: aoConcluir,
  });
  const registrarVenda = useMutation<void, Error, CorpoResgateVenda>({
    mutationFn: (corpo) =>
      enviar('/api/carteira/resgate', 'POST', corpo, 'Erro ao registrar a operação'),
    onSuccess: aoConcluir,
  });

  return { salvarPlano, registrarCompra, registrarVenda };
}
