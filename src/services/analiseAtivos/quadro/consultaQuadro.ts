/**
 * Consulta do Quadro (v2.4, Filtros de Fundamentos) — PURA, sobre as linhas já convertidas
 * (LinhaQuadroApi, com os critérios projetados na janela pedida) do Quadro (noQuadro=true). Sem
 * banco: a rota passa as linhas do leitor em memória, os params dos critérios e o conjunto "Na minha
 * carteira" (rec. 8: filtro e ordem no servidor).
 *
 * - Critérios combinam com E lógico na janela: a linha só passa se ATENDE a cada critério ligado.
 *   'nao_atende', 'sem_dado' (conta como não atende) e 'nao_se_aplica' nunca passam; linha sem
 *   avaliação (criterios null) também não. Em FII o chip é o PAR tijolo/papel (equivalências
 *   vac↔inad, alav↔ltv): vale a marca do id do chip OU a do equivalente.
 * - Demais filtros (E): naCarteira, setor (ação: setor B3) / segmento (FII: segmento CVM).
 * - Ordem padrão A–Z (ticker). Ordens por coluna por whitelist; nulos e 'n/a' SEMPRE no fim, nas
 *   duas direções; desempate pelo ticker (página estável). 'criterios' = contagem atendida na janela.
 * - Facetas, contagens das abas e totalClasse saem do universo da classe, antes dos filtros.
 * - definicoes: chips da barra (de criteria_params), na ordem do perfil.
 *
 * v2.5 (fatia B): o FII sai com o tipo EXIBIDO (Tijolo | Papel, comTipoFiiExibido — perfil dos
 * critérios) e FoF/Híbrido como prefixo do segmento (segmentoTipo); a faceta Tipo tem só os 2
 * valores. Com a v2 do criteria_params todos os chips ficam habilitados (vacância/inadimplência e
 * LTV ativos): FII sem o dado da série tem a marca 'sem_dado' e conta como não atende.
 *
 * Stocks e REITs (fatia C, docs/analise-ativos/stocks-reits/desenho.json): classes 'stock'/'reit'
 * com `eua` (ANALISE_ATIVOS_EUA_HABILITADO; sem ela a rota já respondeu 404). Contagens das abas
 * EUA só com `eua.habilitado`; moeda 'USD' e a regra do universo (universoDescricao, SEM nome de
 * índice). Sem `eua.preco` (decisão do Wellington de 17/10) preço, P/L, DY, data e variação saem
 * nulos/ausentes com o motivo 'licenca' (comCotacaoEua). Faceta/filtro: stock = setor (divisão SIC),
 * reit = segmento curado. Chips: perfis.stock / perfis.reit (ocupação inativa = chip desabilitado).
 */
import { pregoesEntre } from '@/services/analiseAtivos/regras/comum/pregoes';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import { DIRECAO_PADRAO, ORDEM_PADRAO, PAGINA_QUADRO } from '@/constants/analiseAtivosVisual';
import { comTipoFiiExibido } from '@/services/analiseAtivos/quadro/tipoFiiExibido';
import {
  universoEuaDe,
  type CriteriaParams,
  type DefCriterio,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_CODIGO } from '@/services/analiseAtivos/params/criteriaParamsCodigo';
import { TEXTOS_EUA, textoUniverso } from '@/services/analiseAtivos/textosEua';
import { normalizarTickerEua } from '@/types/analiseAtivosEua';
import {
  CLASSES_EUA,
  ehClasseEua,
  type ClasseQuadro,
  DirecaoOrdem,
  Estado,
  FrescorCotacao,
  LinhaQuadroApi,
  OrdemQuadro,
  QuadroParams,
  QuadroResposta,
  TipoFiiExibido,
  TIPOS_FII_EXIBIDOS,
} from '@/types/analiseAtivosApi';
import {
  JANELA_PADRAO,
  ehIdCriterio,
  type DefCriterioChip,
  type IdCriterio,
} from '@/types/analiseAtivosCriterios';

export const LIMITE_MAXIMO = 100;
/** Cotação com mais pregões de atraso que isto = 'atrasado' (mesmo limite do painel de frescor). */
export const PREGOES_ATRASO_COTACAO = 2;

const valorOk = (e: Estado<number>): number | null => (e.estado === 'ok' ? e.valor : null);

/** Valor de ordenação de cada coluna; null = vai para o fim. */
export const VALOR_ORDEM: Record<
  Exclude<OrdemQuadro, 'ticker'>,
  (l: LinhaQuadroApi) => number | null
> = {
  // contagem de critérios atendidos na janela projetada (fato, não nota); sem avaliação = fim
  criterios: (l) => l.criterios?.n ?? null,
  // Lucro (ou Rendimento) 10 anos = anos com valor positivo na série de 10 anos fechados
  lucro10: (l) =>
    l.serie10a.length === 0 ? null : l.serie10a.filter((p) => (p.valor ?? 0) > 0).length,
  preco: (l) => valorOk(l.preco),
  anosLucro: (l) => l.anosLucroConsecutivos,
  mesesRendimento: (l) => l.mesesComRendimento,
  roe: (l) => valorOk(l.roe),
  pl: (l) => valorOk(l.pl),
  pvp: (l) => valorOk(l.pvp),
  dy: (l) => valorOk(l.dy12m),
  margem: (l) => valorOk(l.margemLiquida),
  divLiqEbitda: (l) => valorOk(l.divLiqEbitda),
  payout: (l) => valorOk(l.payout),
  vacancia: (l) => valorOk(l.vacanciaCvm),
  valorMercado: (l) => l.valorMercado,
  patrimonio: (l) => l.patrimonio,
  liquidez: (l) => l.liquidezMedia21,
  obrigacoesPl: (l) => valorOk(l.obrigacoesPl),
  cotistas: (l) => l.cotistas,
};

const finito = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const porTicker = (a: LinhaQuadroApi, b: LinhaQuadroApi) => a.ticker.localeCompare(b.ticker);

export function compararLinhas(
  ordem: OrdemQuadro,
  dir: DirecaoOrdem,
): (a: LinhaQuadroApi, b: LinhaQuadroApi) => number {
  const m = dir === 'desc' ? -1 : 1;
  if (ordem === 'ticker') return (a, b) => m * porTicker(a, b);
  const valor = VALOR_ORDEM[ordem];
  return (a, b) => {
    const va = valor(a);
    const vb = valor(b);
    const ta = finito(va);
    const tb = finito(vb);
    if (ta && tb && va !== vb) return m * (va - vb);
    if (ta !== tb) return ta ? -1 : 1; // nulos no fim nas duas direções
    return porTicker(a, b);
  };
}

/** Ids da query (?criterios=rec,luc) sem repetição; ids desconhecidos são descartados. */
export function idsDaQuery(criterios: string | undefined | null): IdCriterio[] {
  if (!criterios) return [];
  const ids = criterios
    .split(',')
    .map((c) => c.trim())
    .filter(ehIdCriterio);
  return [...new Set(ids)];
}

/** Equivalências tijolo → papel (chip de FII). */
export type Equivalencias = Partial<Record<IdCriterio, IdCriterio>>;

/**
 * A linha ATENDE ao critério `id` na janela projetada? Só 'atende' passa. Em FII vale a marca do
 * id do chip ou a do equivalente de papel (um fundo tem só uma das duas).
 */
export function atendeCriterio(
  l: LinhaQuadroApi,
  id: IdCriterio,
  equivalencias: Equivalencias = {},
): boolean {
  const marcas = l.criterios?.marcas;
  if (!marcas) return false;
  const par = l.classe === 'fii' ? equivalencias[id] : undefined;
  const m = marcas.find((x) => x.id === id) ?? (par ? marcas.find((x) => x.id === par) : undefined);
  return m?.estado === 'atende';
}

export interface FiltrosConsulta {
  /** ids ligados (E lógico) */
  criterios?: readonly IdCriterio[];
  naCarteira?: boolean;
  setor?: string;
  segmento?: string;
}

/** Segmento usado pela faceta/filtro: FII = segmento CVM; REIT = segmento curado (rótulo PT). */
function segmentoDaFaceta(l: LinhaQuadroApi): string | null {
  return l.classe === 'reit' ? l.segmento : l.segmentoCvm;
}

/**
 * "Na minha carteira": BR pelo symbol do catálogo; EUA também pelo ticker normalizado (os Assets
 * manuais de stock/REIT da Carteira não têm o ticker exato: BRK.B ↔ BRKB, 'AAPL-<ts>-<rnd>'). A rota
 * põe as duas formas no conjunto (simbolosDoUsuario).
 */
function estaNaCarteira(l: LinhaQuadroApi, naCarteira?: ReadonlySet<string>): boolean {
  if (!naCarteira) return false;
  if (naCarteira.has(l.ticker)) return true;
  return ehClasseEua(l.classe) && naCarteira.has(normalizarTickerEua(l.ticker));
}

export function filtrarLinhas(
  linhas: readonly LinhaQuadroApi[],
  f: FiltrosConsulta,
  naCarteira?: ReadonlySet<string>,
  equivalencias: Equivalencias = {},
): LinhaQuadroApi[] {
  const ids = f.criterios ?? [];
  return linhas.filter((l) => {
    for (const id of ids) if (!atendeCriterio(l, id, equivalencias)) return false;
    if (f.setor && l.setor !== f.setor) return false;
    if (f.segmento && segmentoDaFaceta(l) !== f.segmento) return false;
    if (f.naCarteira && !estaNaCarteira(l, naCarteira)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Definições dos chips (criteria_params)
// ---------------------------------------------------------------------------

function chipDe(c: DefCriterio, par: DefCriterio | null): DefCriterioChip {
  // desabilitado só quando o critério do chip é inativo (v1, D3: vacância/inadimplência); na v2
  // nenhum critério tem ativo:false e todo chip (com o par de papel) fica habilitado
  const inativo = c.ativo === false;
  return {
    id: c.id,
    rotulo: c.rotulo,
    definicao: c.definicao,
    equivalente: par ? { id: par.id, rotulo: par.rotulo, definicao: par.definicao } : null,
    habilitado: !inativo,
    motivoDesabilitado: inativo ? TEXTOS_CRITERIOS.chips.tooltipDesabilitado : null,
    seloSemDado: inativo,
  };
}

/** Chips da barra de filtros da classe (FII = pares tijolo/papel pelas equivalências). */
export function definicoesQuadro(classe: ClasseQuadro, p: CriteriaParams): DefCriterioChip[] {
  if (classe === 'acao') return p.perfis.acao.map((c) => chipDe(c, null));
  // EUA: perfis opcionais da v3 (stock_financeira usa a lista de stock); v1/v2 = sem chips
  if (classe === 'stock') return (p.perfis.stock ?? []).map((c) => chipDe(c, null));
  if (classe === 'reit') return (p.perfis.reit ?? []).map((c) => chipDe(c, null));
  const eq = p.equivalencias as Equivalencias;
  return p.perfis.fii_tijolo.map((c) => {
    const idPar = eq[c.id];
    const par = idPar ? (p.perfis.fii_papel.find((x) => x.id === idPar) ?? null) : null;
    return chipDe(c, par);
  });
}

/** Ids que a rota aceita em ?criterios= para a classe: só chips habilitados. */
export function idsFiltraveis(definicoes: readonly DefCriterioChip[]): Set<IdCriterio> {
  return new Set(definicoes.filter((d) => d.habilitado).map((d) => d.id));
}

const ordenarPt = (xs: Iterable<string>) =>
  [...new Set(xs)].sort((a, b) => a.localeCompare(b, 'pt-BR'));

/** Facetas da classe; em FII, só os tipos exibidos (Tijolo | Papel) presentes. */
export function facetasDe(
  classe: ClasseQuadro,
  linhas: readonly LinhaQuadroApi[],
): { setores: string[]; tipos: TipoFiiExibido[] } {
  const setores = ordenarPt(
    linhas
      .map((l) => (classe === 'acao' || classe === 'stock' ? l.setor : segmentoDaFaceta(l)))
      .filter((s): s is string => !!s),
  );
  if (classe !== 'fii') return { setores, tipos: [] };
  const presentes = new Set(linhas.map((l) => comTipoFiiExibido(l).fiiTipo));
  return { setores, tipos: TIPOS_FII_EXIBIDOS.filter((t) => presentes.has(t)) };
}

/**
 * Frescor da cotação do Quadro: pregões depois da última data de preço e ANTES de hoje (o
 * fechamento de hoje só chega à noite) — mais de PREGOES_ATRASO_COTACAO = 'atrasado'.
 */
export function frescorCotacao(linhas: readonly LinhaQuadroApi[], hoje: string): FrescorCotacao {
  const datas = linhas.map((l) => l.precoData).filter((d): d is string => !!d);
  if (datas.length === 0) return { data: null, status: 'sem_dado' };
  const data = datas.reduce((a, b) => (a > b ? a : b));
  const atraso =
    data >= hoje ? 0 : pregoesEntre(data, hoje).filter((d) => d > data && d < hoje).length;
  return { data, status: atraso > PREGOES_ATRASO_COTACAO ? 'atrasado' : 'em_dia' };
}

export interface EntradaConsulta {
  params: QuadroParams;
  /** linhas do Quadro (noQuadro=true) das DUAS classes, com os critérios na janela pedida */
  linhas: readonly LinhaQuadroApi[];
  naCarteira?: ReadonlySet<string>;
  versao: string;
  dataRef: string | null;
  hoje: string;
  /** params dos critérios (chips e equivalências); sem eles, sem chips e sem filtro de critério */
  criteriaParams?: CriteriaParams;
  /**
   * EUA: chaves já resolvidas pela rota. Ausente = desligado (abas EUA sem contagem e, se a classe
   * vier mesmo assim, sem cotação).
   */
  eua?: { habilitado: boolean; preco: boolean };
}

const SEM_COTACAO_EUA: Estado<number> = {
  estado: 'ausente',
  motivo: 'licenca',
  texto: TEXTOS_EUA.cotacao.indisponivel,
};

/**
 * Linha stock/reit SEM a chave de preço (decisão do Wellington de 17/10): preço, P/L e DY ausentes
 * com o motivo 'licenca', data, variação e valor de mercado nulos. Linha BR ou com a chave: igual.
 */
export function comCotacaoEua(l: LinhaQuadroApi, preco: boolean): LinhaQuadroApi {
  if (!ehClasseEua(l.classe) || preco) return l;
  return {
    ...l,
    preco: SEM_COTACAO_EUA,
    precoData: null,
    variacaoDiaPct: null,
    pl: SEM_COTACAO_EUA,
    dy12m: SEM_COTACAO_EUA,
    valorMercado: null,
  };
}

/** Regra do universo EUA da classe (sem nome de índice), pelo corte do params vigente. */
export function universoDescricaoDe(classe: ClasseQuadro, p?: CriteriaParams): string | undefined {
  if (!ehClasseEua(classe)) return undefined;
  const corte = universoEuaDe(p ?? CRITERIA_PARAMS_CODIGO)[classe].floatEntradaUsd;
  return textoUniverso(classe, corte);
}

export function consultarQuadro(e: EntradaConsulta): QuadroResposta {
  const { params } = e;
  const precoEua = e.eua?.preco === true && e.eua.habilitado;
  const daClasse = e.linhas
    .filter((l) => l.classe === params.classe && l.noQuadro)
    .map(comTipoFiiExibido)
    .map((l) => comCotacaoEua(l, precoEua));
  const ordem = params.ordem ?? ORDEM_PADRAO;
  const dir = params.dir ?? DIRECAO_PADRAO[ordem];
  const limite = Math.min(Math.max(params.limite ?? PAGINA_QUADRO, 1), LIMITE_MAXIMO);
  const offset = Math.max(params.offset ?? 0, 0);
  const janela = params.janela ?? JANELA_PADRAO;
  const definicoes = e.criteriaParams ? definicoesQuadro(params.classe, e.criteriaParams) : [];
  const permitidos = idsFiltraveis(definicoes);
  const criterios = idsDaQuery(params.criterios).filter((id) => permitidos.has(id));
  const equivalencias = (e.criteriaParams?.equivalencias ?? {}) as Equivalencias;
  const filtradas = filtrarLinhas(
    daClasse,
    {
      criterios,
      naCarteira: params.naCarteira,
      setor: params.setor,
      segmento: params.segmento,
    },
    e.naCarteira,
    equivalencias,
  ).sort(compararLinhas(ordem, dir));
  return {
    classe: params.classe,
    dataRef: e.dataRef,
    versao: e.versao,
    total: filtradas.length,
    offset,
    limite,
    contagens: contagensDe(e.linhas, e.eua?.habilitado === true),
    facetas: facetasDe(params.classe, daClasse),
    frescorCotacao: frescorCotacao(daClasse, e.hoje),
    itens: filtradas.slice(offset, offset + limite),
    janela,
    totalClasse: daClasse.length,
    definicoes,
    ...(ehClasseEua(params.classe)
      ? {
          moeda: 'USD' as const,
          universoDescricao: universoDescricaoDe(params.classe, e.criteriaParams),
        }
      : {}),
  };
}

/** Contadores das abas (noQuadro); stock/reit só com a chave EUA. */
export function contagensDe(
  linhas: readonly LinhaQuadroApi[],
  eua: boolean,
): QuadroResposta['contagens'] {
  const conta = (c: ClasseQuadro) => linhas.filter((l) => l.classe === c && l.noQuadro).length;
  const out: QuadroResposta['contagens'] = { acao: conta('acao'), fii: conta('fii') };
  if (eua) for (const c of CLASSES_EUA) out[c] = conta(c);
  return out;
}
