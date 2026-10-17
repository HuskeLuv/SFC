/**
 * Detectores PUROS dos avisos das listas (bloco 1, fatia D). Recebem linhas já lidas do banco e
 * devolvem FATOS (globais, sem usuário); o job (alertas/executarAlertasSalvos.ts) cruza os fatos com
 * as listas de cada usuário. Nenhum detector chama terceiros nem lê relógio próprio.
 *
 * Os 3 tipos neutros (desenho.json → arquitetura.alertas):
 *  1) resultado — ações: AssetEvento tipo='resultado', estimado=false, fetchedAt nos últimos 3 dias
 *     E data da entrega ≥ hoje−7 (o 2º filtro barra backfill/reprocesso do cvm-ipe, que regrava
 *     fetchedAt no update). UM fato por companhia (PETR3+PETR4 = 1). FIIs: refQuarter novo em
 *     fii_quarterly contra o marco 'fii_trimestral' (1ª vez silenciosa).
 *  2) provento — linha nova em asset_dividend_history (createdAt nos últimos 3 dias) com data-com
 *     REAL (regras/calculo/proventos.dataComReal; no YAHOO a coluna date é a data EX) ≥ hoje. Só
 *     dividendo/JCP/rendimento (amortização e restituição de capital ficam fora).
 *  3) criterios — CriteriaEval(symbol, janela 5) contra o marco 'criterios:5'. Silencioso: 1ª vez do
 *     ativo, troca de paramsVersion (v1→v2 geraria avisos em massa), troca do nº de critérios
 *     aplicáveis (é mudança de metodologia/dado, não de contagem) e avaliação sem dado.
 */
import { dataComReal, normalizarTipo } from '@/services/analiseAtivos/regras/calculo/proventos';
import type { ProventoBruto, ScoringParams } from '@/services/analiseAtivos/tipos';

const DIA_MS = 86_400_000;
/** fetchedAt/createdAt aceitos: últimos 3 dias (a rodada é diária; 3 dias cobrem um job que falhou). */
export const JANELA_NOVIDADE_DIAS = 3;
/** Entrega à CVM aceita: data ≥ hoje − 7 (barra reprocesso de entregas antigas). */
export const JANELA_ENTREGA_DIAS = 7;

/** Relógio da rodada: `hoje` = data civil 'AAAA-MM-DD' (ctx.hoje) e `agoraMs` = Date.now(). */
export interface RelogioAlertas {
  hoje: string;
  agoraMs: number;
}

const somarDias = (dataIso: string, dias: number): string =>
  new Date(Date.parse(`${dataIso}T00:00:00.000Z`) + dias * DIA_MS).toISOString().slice(0, 10);

const recente = (iso: string, r: RelogioAlertas): boolean => {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= r.agoraMs - JANELA_NOVIDADE_DIAS * DIA_MS;
};

// ===========================================================================
// 1) Resultado entregue à CVM (ações)
// ===========================================================================

export interface EventoResultadoBruto {
  id: string;
  cnpj: string;
  tipo: string;
  periodoRef: string | null;
  /** data da entrega 'AAAA-MM-DD' */
  data: string;
  estimado: boolean;
  /** ISO */
  fetchedAt: string;
}

export interface FatoResultado {
  tipo: 'resultado';
  origem: 'cvm_ipe';
  /** 'evento:<AssetEvento.id>' */
  chave: string;
  cnpj: string;
  /** tickers do Quadro com esse CNPJ, em ordem alfabética */
  tickers: string[];
  periodoRef: string;
  data: string;
}

/**
 * Entregas reais e recentes, uma por companhia (a de data mais nova; empate → id), só de CNPJ com
 * ticker no Quadro.
 */
export function detectarResultados(
  eventos: readonly EventoResultadoBruto[],
  cnpjParaTickers: ReadonlyMap<string, readonly string[]>,
  relogio: RelogioAlertas,
): FatoResultado[] {
  const corteData = somarDias(relogio.hoje, -JANELA_ENTREGA_DIAS);
  const porCnpj = new Map<string, EventoResultadoBruto>();
  for (const e of eventos) {
    if (e.tipo !== 'resultado' || e.estimado || !e.periodoRef) continue;
    if (!recente(e.fetchedAt, relogio) || e.data < corteData || e.data > relogio.hoje) continue;
    const tickers = cnpjParaTickers.get(e.cnpj);
    if (!tickers || tickers.length === 0) continue;
    const atual = porCnpj.get(e.cnpj);
    if (!atual || e.data > atual.data || (e.data === atual.data && e.id > atual.id)) {
      porCnpj.set(e.cnpj, e);
    }
  }
  return [...porCnpj.values()]
    .map((e) => ({
      tipo: 'resultado' as const,
      origem: 'cvm_ipe' as const,
      chave: `evento:${e.id}`,
      cnpj: e.cnpj,
      tickers: [...(cnpjParaTickers.get(e.cnpj) ?? [])].sort(),
      periodoRef: e.periodoRef as string,
      data: e.data,
    }))
    .sort((a, b) => a.chave.localeCompare(b.chave));
}

// ===========================================================================
// 1b) Informe trimestral do FII (fii_quarterly)
// ===========================================================================

export interface FiiTrimestralBruto {
  symbol: string;
  cnpj: string;
  /** último dia do trimestre 'AAAA-MM-DD' */
  refQuarter: string;
  /** ISO (quando o job fii-trimestral leu o informe) */
  fetchedAt: string;
}

export interface MarcoFiiTrimestral {
  refQuarter: string;
}

export interface FatoFiiTrimestral {
  tipo: 'resultado';
  origem: 'fii_trimestral';
  /** 'fii_tri:<cnpj>:<AAAA-MM-DD>' */
  chave: string;
  cnpj: string;
  tickers: string[];
  refQuarter: string;
  /** 'AAAA-MM-DD' (data em que o informe apareceu na base) */
  publicadoEm: string;
}

export interface MarcoNovo<M> {
  symbol: string;
  tipo: string;
  marco: M;
}

/**
 * Por símbolo, o informe mais novo contra o marco: sem marco ⇒ grava em silêncio; refQuarter maior
 * que o do marco ⇒ fato (um por CNPJ) + marco novo; igual/menor ⇒ nada.
 */
export function detectarFiiTrimestral(
  linhas: readonly FiiTrimestralBruto[],
  marcos: ReadonlyMap<string, MarcoFiiTrimestral>,
  tipoMarco = 'fii_trimestral',
): { fatos: FatoFiiTrimestral[]; marcosNovos: MarcoNovo<MarcoFiiTrimestral>[] } {
  const maisNovo = new Map<string, FiiTrimestralBruto>();
  for (const l of linhas) {
    const atual = maisNovo.get(l.symbol);
    if (!atual || l.refQuarter > atual.refQuarter) maisNovo.set(l.symbol, l);
  }
  const marcosNovos: MarcoNovo<MarcoFiiTrimestral>[] = [];
  const porChave = new Map<string, FatoFiiTrimestral>();
  for (const [symbol, l] of [...maisNovo.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const marco = marcos.get(symbol);
    if (marco && l.refQuarter <= marco.refQuarter) continue;
    marcosNovos.push({ symbol, tipo: tipoMarco, marco: { refQuarter: l.refQuarter } });
    if (!marco) continue; // 1ª vez: silencioso
    const chave = `fii_tri:${l.cnpj}:${l.refQuarter}`;
    const fato = porChave.get(chave);
    if (fato) {
      if (!fato.tickers.includes(symbol)) fato.tickers = [...fato.tickers, symbol].sort();
      continue;
    }
    porChave.set(chave, {
      tipo: 'resultado',
      origem: 'fii_trimestral',
      chave,
      cnpj: l.cnpj,
      tickers: [symbol],
      refQuarter: l.refQuarter,
      publicadoEm: l.fetchedAt.slice(0, 10),
    });
  }
  return { fatos: [...porChave.values()], marcosNovos };
}

// ===========================================================================
// 2) Provento anunciado (data-com)
// ===========================================================================

export type TipoProventoAviso = 'dividendo' | 'jcp' | 'rendimento' | 'outro';

/** Linha do asset_dividend_history já na convenção de datas (repositorio/proventos.paraProventoBruto). */
export interface LinhaProventoAlerta extends ProventoBruto {
  /** ISO (createdAt da linha) */
  criadoEm: string;
}

export interface FatoProvento {
  tipo: 'provento';
  /** 'provento:<symbol>:<tipo>:<dataCom>' */
  chave: string;
  symbol: string;
  tipoProvento: TipoProventoAviso;
  valor: number;
  /** data-com REAL 'AAAA-MM-DD' */
  dataCom: string;
  /** 'AAAA-MM-DD' ou null (a definir) */
  pagamento: string | null;
}

const TIPO_AVISO_POR_NORMALIZADO: Record<string, TipoProventoAviso | null> = {
  DIVIDENDO: 'dividendo',
  JCP: 'jcp',
  RENDIMENTO: 'rendimento',
  OUTRO: 'outro',
  AMORTIZACAO: null,
  REST_CAP: null,
};

/**
 * Proventos recém-gravados (createdAt ≤ 3 dias) cuja data-com real ainda não passou. Repetições
 * (mesmo símbolo, tipo e data-com) viram 1 fato; o valor é o da 1ª linha em ordem de id.
 */
export function detectarProventos(
  linhas: readonly LinhaProventoAlerta[],
  relogio: RelogioAlertas,
  params: ScoringParams,
): FatoProvento[] {
  const out = new Map<string, FatoProvento>();
  const ordenadas = [...linhas].sort((a, b) => a.id.localeCompare(b.id));
  for (const l of ordenadas) {
    if (!recente(l.criadoEm, relogio) || !(l.valor > 0)) continue;
    const dataCom = dataComReal(l.dataExGravada, l.source, params, l);
    if (!dataCom || dataCom < relogio.hoje) continue;
    const tipoProvento = TIPO_AVISO_POR_NORMALIZADO[normalizarTipo(l.tipo, params).tipo] ?? null;
    if (!tipoProvento) continue;
    const symbol = l.symbol.toUpperCase();
    const chave = `provento:${symbol}:${tipoProvento}:${dataCom}`;
    if (out.has(chave)) continue;
    out.set(chave, {
      tipo: 'provento',
      chave,
      symbol,
      tipoProvento,
      valor: l.valor,
      dataCom,
      pagamento: l.dataPagamento,
    });
  }
  return [...out.values()];
}

// ===========================================================================
// 3) Mudança no "n de 6" (janela fixa de 5 anos)
// ===========================================================================

export interface AvaliacaoCriterios5 {
  symbol: string;
  atendidos: number;
  aplicaveis: number;
  anoInicio: number;
  anoFim: number;
  paramsVersion: number;
  semDado: boolean;
}

export interface ContagemCriterios {
  atendidos: number;
  aplicaveis: number;
}

/** Json de analise_alerta_marcos (tipo 'criterios:5'). */
export interface MarcoCriterios extends ContagemCriterios {
  anoInicio: number;
  anoFim: number;
  paramsVersion: number;
  anterior?: ContagemCriterios;
  /** ISO */
  mudouEm?: string;
}

export interface FatoCriterios {
  tipo: 'criterios';
  /**
   * 'criterios5:<symbol>:<anoFim>:v<paramsVersion>:<de>><para>:<mudouEm do marco | 'inicio'>'
   * (de/para = 'atendidos/aplicaveis'). O último pedaço é a mudança anterior do marco: distingue a
   * ida e volta (A→B→A→B) dentro da mesma anoFim e continua igual se a rodada repetir com o marco
   * não gravado (lote com erro), então o dedupe em analise_alerta_envios segue valendo.
   */
  chave: string;
  symbol: string;
  de: ContagemCriterios;
  para: ContagemCriterios;
  anoInicio: number;
  anoFim: number;
  /** ISO */
  mudouEm: string;
}

const contagem = (c: ContagemCriterios) => `${c.atendidos}/${c.aplicaveis}`;

/**
 * Compara a avaliação de 5 anos com o marco. Só a mudança de `atendidos` com os mesmos
 * `aplicaveis` e a mesma versão de parâmetros vira fato; o resto atualiza o marco em silêncio.
 * Sem mudança nenhuma ⇒ nem marco novo (0 gravações na 2ª rodada).
 */
export function detectarCriterios(
  avaliacoes: readonly AvaliacaoCriterios5[],
  marcos: ReadonlyMap<string, MarcoCriterios>,
  agoraIso: string,
  tipoMarco = 'criterios:5',
): { fatos: FatoCriterios[]; marcosNovos: MarcoNovo<MarcoCriterios>[] } {
  const fatos: FatoCriterios[] = [];
  const marcosNovos: MarcoNovo<MarcoCriterios>[] = [];
  for (const a of [...avaliacoes].sort((x, y) => x.symbol.localeCompare(y.symbol))) {
    if (a.semDado || a.aplicaveis <= 0) continue;
    const symbol = a.symbol.toUpperCase();
    const marco = marcos.get(symbol);
    const base: MarcoCriterios = {
      atendidos: a.atendidos,
      aplicaveis: a.aplicaveis,
      anoInicio: a.anoInicio,
      anoFim: a.anoFim,
      paramsVersion: a.paramsVersion,
    };
    if (!marco || marco.paramsVersion !== a.paramsVersion || marco.aplicaveis !== a.aplicaveis) {
      // 1ª vez, troca de parâmetros ou de aplicáveis: silencioso (regrava o marco limpo)
      marcosNovos.push({ symbol, tipo: tipoMarco, marco: base });
      continue;
    }
    if (marco.atendidos === a.atendidos) {
      if (marco.anoFim !== a.anoFim || marco.anoInicio !== a.anoInicio) {
        const { anterior, mudouEm } = marco;
        marcosNovos.push({
          symbol,
          tipo: tipoMarco,
          marco: {
            ...base,
            ...(anterior ? { anterior } : {}),
            ...(mudouEm ? { mudouEm } : {}),
          },
        });
      }
      continue;
    }
    const de = { atendidos: marco.atendidos, aplicaveis: marco.aplicaveis };
    const para = { atendidos: a.atendidos, aplicaveis: a.aplicaveis };
    marcosNovos.push({
      symbol,
      tipo: tipoMarco,
      marco: { ...base, anterior: de, mudouEm: agoraIso },
    });
    fatos.push({
      tipo: 'criterios',
      chave: `criterios5:${symbol}:${a.anoFim}:v${a.paramsVersion}:${contagem(de)}>${contagem(
        para,
      )}:${marco.mudouEm ?? 'inicio'}`,
      symbol,
      de,
      para,
      anoInicio: a.anoInicio,
      anoFim: a.anoFim,
      mudouEm: agoraIso,
    });
  }
  return { fatos, marcosNovos };
}

// ===========================================================================
// Leitura defensiva dos marcos (Json do banco)
// ===========================================================================

const ehInteiro = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Marco de critérios ilegível ⇒ null (o detector trata como 1ª vez: silencioso). */
export function lerMarcoCriterios(json: unknown): MarcoCriterios | null {
  if (!ehObjeto(json)) return null;
  const { atendidos, aplicaveis, anoInicio, anoFim, paramsVersion, anterior, mudouEm } = json;
  if (![atendidos, aplicaveis, anoFim, paramsVersion].every(ehInteiro)) return null;
  const marco: MarcoCriterios = {
    atendidos: atendidos as number,
    aplicaveis: aplicaveis as number,
    anoInicio: ehInteiro(anoInicio) ? anoInicio : (anoFim as number) - 4,
    anoFim: anoFim as number,
    paramsVersion: paramsVersion as number,
  };
  if (ehObjeto(anterior) && ehInteiro(anterior.atendidos) && ehInteiro(anterior.aplicaveis)) {
    marco.anterior = { atendidos: anterior.atendidos, aplicaveis: anterior.aplicaveis };
  }
  if (typeof mudouEm === 'string' && Number.isFinite(Date.parse(mudouEm))) marco.mudouEm = mudouEm;
  return marco;
}

/** Marco do informe trimestral ilegível ⇒ null (1ª vez: silencioso). */
export function lerMarcoFiiTrimestral(json: unknown): MarcoFiiTrimestral | null {
  if (!ehObjeto(json) || typeof json.refQuarter !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(json.refQuarter) ? { refQuarter: json.refQuarter } : null;
}
