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
 * As consultas da Carteira só disparam quando o usuário tem (ou planejou) o ativo — ou quando o
 * modal "Planejar na carteira" pede a base (`{ base: true }`, aba da classe: Ações/FIIs) — e não
 * bloqueiam a página. Elas podem usar o fallback de cotação da Carteira — por isso ficam fora de
 * /api/analise-ativos/*.
 *
 * 17/10/2026 (ticket do Pedro): o plano é o OBJETIVO DA CARTEIRA (`objetivoAbaPct`, % DENTRO da
 * aba — Portfolio.objetivo ou a linha planejada), o mesmo que o "Planejar na carteira" grava. A base
 * do desvio é a ABA (`valorAba` = soma do valor atualizado das linhas da aba, a mesma base do
 * "% da aba" da tabela); `classePct` (peso da aba na carteira total) dá o "≈ X% da carteira total".
 * Sem posição nem plano, `{ base: true }` (modal Planejar) usa a aba da CLASSE (ação → Ações,
 * FII → FII's).
 *
 * Stocks e REITs (feature EUA, fatia D): as abas Stocks e REIT's também têm a linha detalhada,
 * lida de /api/carteira/stocks|reit com a key do useCarteiraStocks/useReit (a MESMA função de
 * preço da Carteira, getAssetPrices) — "Na sua carteira" mostra o mesmo valor da aba. A linha é
 * achada pela chave sem pontuação (chaveCarteira: a página BRK.B casa a linha 'BRKB' do wizard; a
 * aba REIT's traz o symbol manual 'O-<ts>-<rnd>', reduzido a 'O'). `assetIdPosicao`/`tipoAsset`
 * (overlay) vão para a recompra pela Análise.
 *
 * Unidade (QA de 18/10): a Carteira guarda o REIT em US$ (q × US$, como o Step4ReitFields) e o
 * STOCK em R$ (valorInvestido = q × US$ × câmbio ⇒ preço médio em R$), mas a aba Stocks soma a
 * cotação da BRAPI em US$ ao valor atualizado. Por isso `moeda` é a unidade do preço médio da
 * linha — 'USD' só para REIT numa aba EUA, 'BRL' para stock e para ativo da B3 movido — e
 * `valoresMistos` marca a posição de stock: preço médio em R$ com cotação em US$, sem unidade
 * única; a Análise não exibe esses valores (só a quantidade e o link para a aba). O "% da carteira"
 * converte pelo `cotacaoDolar` da aba só o que está em US$.
 */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { CATEGORIA_API_PATH, rotuloCategoria } from '@/lib/carteiraMover';
import { useOverlayCarteira } from '@/hooks/useAnaliseAtivos';
import {
  chaveCarteira,
  extrairTickerManual,
  noOverlay,
} from '@/services/analiseAtivos/carteira/tickerCarteiraEua';
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
  /** abas Stocks/REIT's: cotação do dólar da Carteira (null = sem cotação) */
  cotacaoDolar?: number | null;
}

export interface OpcoesNaCarteira {
  /** busca a aba da classe (e resumo/configuração) mesmo sem posição nem plano (modal Planejar) */
  base?: boolean;
}

/** 'planejado' = sem posição, com linha planejada na aba (Watchlist). */
export type StatusNaCarteira = 'carregando' | 'erro' | 'nada' | 'posicao' | 'planejado';

/** Abas com a linha detalhada (as demais mostram só a quantidade e o link). */
export type AbaDetalhada = 'acoes' | 'fiis' | 'stocks' | 'reits';

export interface NaCarteiraAtivo {
  status: StatusNaCarteira;
  /** aba efetiva (categoria da Carteira) */
  categoria: string | null;
  abaNome: string | null;
  /** aba com os números aqui (Ações, FII's, Stocks, REIT's); null = só quantidade + link */
  abaDetalhada: AbaDetalhada | null;
  /** unidade do preço médio da linha: 'USD' só para REIT numa aba EUA; stock e B3 = 'BRL' */
  moeda: 'BRL' | 'USD';
  /** posição de stock numa aba EUA: preço médio em R$ e cotação em US$ — não exibir os valores */
  valoresMistos: boolean;
  /** cotação do dólar da aba Stocks/REIT's (null fora delas ou sem cotação; pré-preenche o câmbio) */
  cotacaoDolar: number | null;
  /** EUA: Asset manual da posição (a recompra pela Análise não cria outro) e o Asset.type */
  assetIdPosicao: string | null;
  tipoAsset: 'stock' | 'reit' | null;
  portfolioId: string | null;
  watchlistId: string | null;
  /** quantidade do overlay (vale também para abas sem detalhe) */
  quantidade: number | null;
  /** linha do ativo na aba, igual à tabela da Carteira */
  linha: LinhaAbaCarteira | null;
  /** valorAtualizado ÷ totais.dinheiro × 100 (0 sem posição, quando a base chegou) */
  pctCarteira: number | null;
  /** % da classe na carteira (distribuicao[aba].percentual) e alvo (AlocacaoConfig.target) */
  classePct: number | null;
  classeAlvo: number | null;
  /** aba da base (a efetiva; sem posição/plano, a da classe quando há alvo ou `base`) */
  categoriaBase: string | null;
  abaBaseNome: string | null;
  /** carteira TOTAL (totalDinheiro do resumo, > 0); null = sem base */
  valorBase: number | null;
  /** totais.dinheiro do resumo (0 = carteira vazia) */
  totalCarteira: number | null;
  /** soma do valor atualizado das linhas da aba (base do % da aba e do desvio); null = sem a aba */
  valorAba: number | null;
  /** Objetivo do ativo na Carteira (% dentro da aba); null = 0 / sem objetivo */
  objetivoAbaPct: number | null;
  /** há plano na Carteira: posição com objetivo > 0 ou linha planejada */
  temPlano: boolean;
  /** seção da posição (recompra) e do plano antigo (1ª compra de planejado) */
  estrategia: string | null;
  tipoFii: string | null;
  secaoPlanejada: string | null;
  /** os números da Carteira ainda estão chegando (skeleton só nos números) */
  carregandoNumeros: boolean;
  erroNumeros: boolean;
  refetch: () => void;
}

const ABAS_DETALHADAS: Record<string, AbaDetalhada> = {
  acoes: 'acoes',
  fiis: 'fiis',
  stocks: 'stocks',
  reits: 'reits',
};
const ABAS_USD: ReadonlySet<AbaDetalhada> = new Set(['stocks', 'reits']);

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

/** Categoria de resumo.distribuicao por classe (carteiraTabsConfig). */
const ABA_DA_CLASSE: Record<ClasseQuadro, string> = {
  acao: 'acoes',
  fii: 'fiis',
  stock: 'stocks',
  reit: 'reits',
};

export function linhaDoTicker(
  dados: DadosAba | undefined,
  ticker: string,
): LinhaAbaCarteira | null {
  if (!dados?.secoes) return null;
  // chave sem pontuação: 'BRK.B' casa 'BRKB'; o symbol manual 'O-<ts>-<rnd>' da aba REIT's vira 'O'
  const alvo = chaveCarteira(ticker);
  for (const secao of dados.secoes) {
    const linha = secao.ativos?.find(
      (a) => chaveCarteira(extrairTickerManual(a.ticker ?? '')) === alvo,
    );
    if (linha) return linha;
  }
  return null;
}

/** Σ valorAtualizado das linhas da aba (planejadas valem 0); null enquanto a aba não chegou. */
export function somaDaAba(dados: DadosAba | undefined): number | null {
  if (!dados?.secoes) return null;
  return dados.secoes.reduce(
    (s, secao) =>
      s + (secao.ativos ?? []).reduce((t, a) => t + (Number(a.valorAtualizado) || 0), 0),
    0,
  );
}

const objetivoOuNull = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

export function useNaCarteiraAtivo(
  ticker: string,
  classe: ClasseQuadro,
  opts: OpcoesNaCarteira = {},
): NaCarteiraAtivo {
  const overlay = useOverlayCarteira();
  const tickerNorm = ticker.toUpperCase();
  const posicao = noOverlay(overlay.data?.posicoes, tickerNorm) ?? null;
  const planejado = posicao ? null : (noOverlay(overlay.data?.planejados, tickerNorm) ?? null);
  const categoria = posicao?.categoria ?? planejado?.categoria ?? null;
  const pedeBase = !!opts.base && !!overlay.data;
  const categoriaBase = categoria ?? (pedeBase ? ABA_DA_CLASSE[classe] : null);
  const abaDetalhada = categoriaBase ? (ABAS_DETALHADAS[categoriaBase] ?? null) : null;
  const path = abaDetalhada ? CATEGORIA_API_PATH[abaDetalhada] : null;
  const temAlgo = !!posicao || !!planejado || pedeBase;

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

  const linha = path && categoria ? linhaDoTicker(abaQ.data, tickerNorm) : null;
  const valorAba = path ? somaDaAba(abaQ.data) : null;
  const dinheiro = totalDinheiro(resumoQ.data);
  const valorBase = dinheiro !== null && dinheiro > 0 ? dinheiro : null;
  const abaUsd = !!abaDetalhada && ABAS_USD.has(abaDetalhada);
  // tipo do Asset da linha (overlay); sem posição nem plano, o da classe da página
  const tipoNaAba =
    posicao?.tipoAsset ??
    planejado?.tipoAsset ??
    (classe === 'reit' ? 'reit' : classe === 'stock' ? 'stock' : null);
  const moeda = abaUsd && tipoNaAba === 'reit' ? 'USD' : 'BRL';
  const valoresMistos = abaUsd && !!posicao && tipoNaAba === 'stock';
  const cotacaoDolar =
    abaUsd && typeof abaQ.data?.cotacaoDolar === 'number' && abaQ.data.cotacaoDolar > 0
      ? abaQ.data.cotacaoDolar
      : null;
  // o total da carteira é em R$: só a linha em US$ (REIT) converte pelo dólar da aba
  const paraReais = moeda === 'USD' ? (cotacaoDolar ?? 1) : 1;
  // A linha da aba só é exigida para a posição; sem posição, 0% da carteira.
  const pctCarteira =
    valorBase === null
      ? null
      : linha
        ? ((linha.valorAtualizado * paraReais) / valorBase) * 100
        : posicao
          ? null
          : 0;
  const distrib = categoriaBase
    ? (resumoQ.data?.distribuicao as Record<string, { percentual?: number }> | undefined)?.[
        categoriaBase
      ]
    : undefined;
  const classePct = typeof distrib?.percentual === 'number' ? distrib.percentual : null;
  const alvoClasse = categoriaBase
    ? configQ.data?.find((c) => c.categoria === categoriaBase)
    : undefined;
  const classeAlvo = typeof alvoClasse?.target === 'number' ? alvoClasse.target : null;

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

  // Objetivo na Carteira: da linha da aba quando chegou; senão do overlay.
  const objetivoAbaPct = linha
    ? objetivoOuNull(linha.objetivo)
    : objetivoOuNull(posicao ? posicao.objetivoPct : planejado?.objetivoPct);

  return {
    status,
    categoria,
    categoriaBase,
    abaBaseNome: categoriaBase
      ? rotuloCategoria(categoriaBase as Parameters<typeof rotuloCategoria>[0])
      : null,
    valorBase,
    totalCarteira: dinheiro,
    valorAba,
    objetivoAbaPct,
    temPlano: !!planejado || (!!posicao && objetivoAbaPct !== null),
    estrategia: posicao?.estrategia ?? null,
    tipoFii: posicao?.tipoFii ?? null,
    secaoPlanejada: planejado?.secao ?? null,
    abaNome: categoria ? rotuloCategoria(categoria as Parameters<typeof rotuloCategoria>[0]) : null,
    abaDetalhada,
    moeda,
    valoresMistos,
    cotacaoDolar,
    assetIdPosicao: posicao?.assetId ?? null,
    tipoAsset: posicao?.tipoAsset ?? planejado?.tipoAsset ?? null,
    portfolioId: posicao?.portfolioId ?? null,
    watchlistId: planejado?.watchlistId ?? null,
    quantidade: posicao?.quantidade ?? null,
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
