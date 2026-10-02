'use client';

/**
 * "Na sua carteira" (fatia D, crítica 8): os números são os MESMOS da aba da Carteira — nada é
 * recalculado aqui.
 *
 * - overlay (/api/analise-ativos/carteira) → em qual aba EFETIVA está o ticker (respeita o mover);
 * - aba Ações/FII's: GET /api/carteira/acoes|fii com a MESMA queryKey do useAcoes/useFii
 *   (queryKeys.assets.type) → a linha do ativo como a tabela da aba mostra (quantidade, preço
 *   médio, valor atualizado, % da aba, objetivo, quanto falta, rentabilidade, linha planejada);
 * - resumo: GET /api/carteira/resumo com a key do useCarteira → distribuicao[aba].percentual e
 *   totais.dinheiro ('% da carteira' = valorAtualizado ÷ totais.dinheiro);
 * - configuração: GET /api/carteira/configuracao com a key do useAlocacaoConfig → alvo da classe.
 *
 * As consultas da Carteira só disparam quando o usuário tem (ou planejou) o ativo, e não bloqueiam
 * a página. Elas podem usar o fallback de cotação da Carteira — por isso ficam fora de
 * /api/analise-ativos/*.
 */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { CATEGORIA_API_PATH, rotuloCategoria } from '@/lib/carteiraMover';
import { useOverlayCarteira } from '@/hooks/useAnaliseAtivos';
import type { AlocacaoConfig } from '@/hooks/useAlocacaoConfig';
import type { CarteiraResumo } from '@/hooks/useCarteira';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

/** Campos da linha da aba (BaseQuantityAtivo) que o bloco mostra. */
export interface LinhaAbaCarteira {
  id: string;
  ticker: string;
  quantidade: number;
  precoAquisicao: number;
  cotacaoAtual: number;
  valorAtualizado: number;
  percentualCarteira: number;
  objetivo: number;
  quantoFalta: number;
  necessidadeAporte: number;
  rentabilidade: number;
  planejado?: boolean;
}

interface DadosAba {
  secoes?: Array<{ ativos?: LinhaAbaCarteira[] }>;
}

export type StatusNaCarteira = 'carregando' | 'erro' | 'nada' | 'posicao' | 'planejado';

/** Abas com a linha detalhada (as demais mostram só a quantidade e o link). */
export type AbaDetalhada = 'acoes' | 'fiis';

export interface NaCarteiraAtivo {
  status: StatusNaCarteira;
  /** aba efetiva (categoria da Carteira) */
  categoria: string | null;
  abaNome: string | null;
  /** 'acoes' | 'fiis' quando a aba tem os números aqui; null = só quantidade + link */
  abaDetalhada: AbaDetalhada | null;
  portfolioId: string | null;
  watchlistId: string | null;
  /** quantidade do overlay (vale também para abas sem detalhe) */
  quantidade: number | null;
  /** objetivo do planejado no overlay (antes da linha da aba chegar) */
  objetivoPlanejado: number | null;
  /** linha do ativo na aba, igual à tabela da Carteira */
  linha: LinhaAbaCarteira | null;
  /** valorAtualizado ÷ totais.dinheiro × 100 */
  pctCarteira: number | null;
  /** % da classe na carteira (distribuicao[aba].percentual) e alvo (AlocacaoConfig.target) */
  classePct: number | null;
  classeAlvo: number | null;
  /** os números da Carteira ainda estão chegando (skeleton só nos números) */
  carregandoNumeros: boolean;
  erroNumeros: boolean;
  refetch: () => void;
}

const ABAS_DETALHADAS: Record<string, AbaDetalhada> = { acoes: 'acoes', fiis: 'fiis' };

/** Mesma fetch do useAssetData (a key é compartilhada com a aba da Carteira). */
async function buscarAba(path: string, signal?: AbortSignal): Promise<DadosAba> {
  const res = await fetch(`/api/carteira/${path}`, {
    method: 'GET',
    credentials: 'include',
    signal,
  });
  if (!res.ok) throw new Error('Erro ao carregar a aba da Carteira');
  return res.json();
}

/** Resumo COMPLETO (o mesmo resultado final do useCarteira, com histórico) — a key é dele. */
async function buscarResumo(signal?: AbortSignal): Promise<CarteiraResumo> {
  const res = await fetch('/api/carteira/resumo', {
    method: 'GET',
    credentials: 'include',
    signal,
  });
  if (!res.ok) throw new Error('Erro ao carregar dados da carteira');
  return res.json();
}

/** Mesma fetch do useAlocacaoConfig. */
async function buscarConfiguracao(signal?: AbortSignal): Promise<AlocacaoConfig[]> {
  const res = await fetch('/api/carteira/configuracao', {
    method: 'GET',
    credentials: 'include',
    signal,
  });
  if (!res.ok) throw new Error('Erro ao buscar configurações');
  const data = await res.json();
  return data.configuracoes;
}

/** Denominador da carteira: totais.dinheiro (fallback do AlocacaoAtivosTable sem `totais`). */
export function totalDinheiro(resumo: CarteiraResumo | undefined | null): number | null {
  if (!resumo) return null;
  if (typeof resumo.totais?.dinheiro === 'number') return resumo.totais.dinheiro;
  if (!resumo.distribuicao) return null;
  return Object.entries(resumo.distribuicao)
    .filter(([k]) => k !== 'imoveisBens')
    .reduce((s, [, v]) => s + (v?.valor || 0), 0);
}

export function linhaDoTicker(
  dados: DadosAba | undefined,
  ticker: string,
): LinhaAbaCarteira | null {
  if (!dados?.secoes) return null;
  const alvo = ticker.toUpperCase();
  for (const secao of dados.secoes) {
    const linha = secao.ativos?.find((a) => (a.ticker ?? '').toUpperCase() === alvo);
    if (linha) return linha;
  }
  return null;
}

export function useNaCarteiraAtivo(ticker: string, _classe: ClasseQuadro): NaCarteiraAtivo {
  const overlay = useOverlayCarteira();
  const tickerNorm = ticker.toUpperCase();
  const posicao = overlay.data?.posicoes[tickerNorm] ?? null;
  const planejado = posicao ? null : (overlay.data?.planejados[tickerNorm] ?? null);
  const categoria = posicao?.categoria ?? planejado?.categoria ?? null;
  const abaDetalhada = categoria ? (ABAS_DETALHADAS[categoria] ?? null) : null;
  const path = abaDetalhada ? CATEGORIA_API_PATH[abaDetalhada] : null;
  const temAlgo = !!posicao || !!planejado;

  const abaQ = useQuery<DadosAba>({
    queryKey: queryKeys.assets.type(path ?? ''),
    queryFn: ({ signal }) => buscarAba(path as string, signal),
    enabled: !!path,
  });
  const resumoQ = useQuery<CarteiraResumo>({
    queryKey: queryKeys.carteira.resumo(),
    queryFn: ({ signal }) => buscarResumo(signal),
    enabled: temAlgo && !!abaDetalhada,
  });
  const configQ = useQuery<AlocacaoConfig[]>({
    queryKey: queryKeys.alocacao.config(),
    queryFn: ({ signal }) => buscarConfiguracao(signal),
    enabled: temAlgo && !!abaDetalhada,
  });

  const linha = path ? linhaDoTicker(abaQ.data, tickerNorm) : null;
  const dinheiro = totalDinheiro(resumoQ.data);
  const pctCarteira =
    linha && dinheiro && dinheiro > 0 ? (linha.valorAtualizado / dinheiro) * 100 : null;
  const distrib = categoria
    ? (resumoQ.data?.distribuicao as Record<string, { percentual?: number }> | undefined)?.[
        categoria
      ]
    : undefined;
  const classePct = typeof distrib?.percentual === 'number' ? distrib.percentual : null;
  const alvo = categoria ? configQ.data?.find((c) => c.categoria === categoria) : undefined;
  const classeAlvo = typeof alvo?.target === 'number' ? alvo.target : null;

  const status: StatusNaCarteira = overlay.isPending
    ? 'carregando'
    : overlay.isError
      ? 'erro'
      : posicao
        ? 'posicao'
        : planejado
          ? 'planejado'
          : 'nada';

  const carregandoNumeros =
    !!abaDetalhada && (abaQ.isPending || resumoQ.isPending || configQ.isPending);
  const erroNumeros = !!abaDetalhada && (abaQ.isError || resumoQ.isError || configQ.isError);

  return {
    status,
    categoria,
    abaNome: categoria ? rotuloCategoria(categoria as Parameters<typeof rotuloCategoria>[0]) : null,
    abaDetalhada,
    portfolioId: posicao?.portfolioId ?? null,
    watchlistId: planejado?.watchlistId ?? null,
    quantidade: posicao?.quantidade ?? null,
    objetivoPlanejado: planejado?.objetivoPct ?? null,
    linha,
    pctCarteira,
    classePct,
    classeAlvo,
    carregandoNumeros,
    erroNumeros,
    refetch: () => {
      void overlay.refetch();
      if (path) void abaQ.refetch();
      if (abaDetalhada) {
        void resumoQ.refetch();
        void configQ.refetch();
      }
    },
  };
}

export default useNaCarteiraAtivo;
