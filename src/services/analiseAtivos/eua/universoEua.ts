/**
 * Universo EUA POR CIK — Stocks e REITs, fatia A. Puro: o job sec-cadastro monta os candidatos
 * (arquivo de tickers + frames do free float + submissions) e grava a decisão em SecCompany.
 *
 * Regra (decisão do Wellington de 17/10, que prevalece sobre o desenho; UNIVERSO_EUA_PADRAO /
 * criteria_params v3 → universoEuaDe):
 * - ticker NYSE ou Nasdaq no company_tickers_exchange.json (ou no submissions do CIK incluído por
 *   override) e relatório anual 10-K (ADRs com 20-F/40-F ficam fora: não têm float de capa);
 * - stocks: free float da capa ≥ US$ 2 bi para ENTRAR; quem já está só SAI abaixo de US$ 1,6 bi
 *   (histerese de 80%); REITs de patrimônio: mesmo corte (SIC 6798 + overrides; hipotecários fora);
 * - float fora da sanidade (> US$ 1 tri, ou preço implícito fora de [US$ 0,5; 100 mil]) → fora,
 *   foraMotivo 'float_suspeito' + alerta;
 * - financeira = SIC 6000–6799 exceto 6798 (perfil stock_financeira), ou SEM SIC: a SEC não dá SIC
 *   às BDCs (ARCC, MAIN, FSK, OBDC…) e em 21/10/2026 os 10 CIKs do universo sem SIC eram 9 BDCs e
 *   um banco (CBC) — alerta 'sem_sic';
 * - SIC de SICS_FORA_EUA (6221: trusts de ouro/prata/cripto) → fora, foraMotivo 'sic_fora';
 * - o ticker exibido vem SEMPRE do arquivo da SEC; o override só classifica/inclui/exclui o CIK.
 */
import { sanidadeFloat } from '@/services/analiseAtivos/eua/sanidadeSec';
import { segmentoCuradoReit } from '@/services/analiseAtivos/eua/overridesEua';
import {
  BOLSAS_EUA,
  SICS_FORA_EUA,
  SIC_REIT,
  ehSicFinanceira,
  ehTickerEua,
  normalizarCik,
  normalizarTickerEua,
  symbolAnaliseDaSec,
  type BolsaEua,
  type ClasseEua,
  type ForaMotivoEua,
  type OrigemCadastroEua,
  type OverrideCikEua,
  type SanidadeFloat,
  type SegmentoReit,
  type TipoReit,
  type UniversoEuaParams,
} from '@/types/analiseAtivosEua';

export interface TickerSec {
  /** como a SEC escreve (BRK-B) */
  symbol: string;
  /** 'NYSE' | 'Nasdaq' | 'OTC' | 'CBOE' | null … */
  bolsa: string | null;
}

export interface CandidatoUniverso {
  cik: string;
  nome: string;
  /** na ordem do arquivo da SEC (o primeiro é o principal) */
  tickers: TickerSec[];
  sic: number | null;
  publicFloatUsd: number | null;
  publicFloatData: string | null;
  acoesEmCirculacao: number | null;
  /** us-gaap:Assets mais recente (frames), para a sanidade do float */
  ativoTotalUsd: number | null;
  /** o CIK (ou o cikHistorico do override) entrega 10-K */
  tem10k: boolean;
  /** estava no universo no cadastro anterior (histerese) */
  noUniversoAnterior: boolean;
}

export type CodigoAlertaUniverso =
  | 'float_suspeito'
  | 'ticker_sem_10k'
  | 'reit_por_sic_suspeito'
  | 'reit_sem_segmento'
  | 'override_sem_ticker'
  | 'sem_sic';

export interface DecisaoUniverso {
  cik: string;
  classe: ClasseEua;
  ehReit: boolean;
  reitTipo: TipoReit | null;
  segmento: SegmentoReit | null;
  ehFinanceira: boolean;
  bolsa: BolsaEua | null;
  floatSanidade: SanidadeFloat | null;
  noUniverso: boolean;
  foraMotivo: ForaMotivoEua | null;
  origem: OrigemCadastroEua;
  cikHistorico: string | null;
  alertas: { codigo: CodigoAlertaUniverso; mensagem: string }[];
}

const ehBolsa = (b: string | null): b is BolsaEua =>
  b !== null && (BOLSAS_EUA as readonly string[]).includes(b);

/** Bolsa do CIK = a do primeiro ticker NYSE/Nasdaq (na ordem do arquivo). */
export function bolsaDoCandidato(tickers: readonly TickerSec[]): BolsaEua | null {
  for (const t of tickers) if (ehBolsa(t.bolsa)) return t.bolsa;
  return null;
}

/** Última letra que indica CLASSE de ação no padrão da Nasdaq (P/M/N/O = preferenciais, Z/W/U/R…). */
const LETRAS_CLASSE = new Set(['A', 'B', 'C', 'K', 'L']);
// mesmo tamanho: só A/B/C/K (LBRDA/LBRDK); o 'L' é só do caso GOOGL/GOOG (principal mais longo)
const LETRA_MESMO_TAMANHO = new Set(['A', 'B', 'C', 'K']);

/**
 * Outro ticker do MESMO CIK é classe de ação do principal (vira linha, como PETR3/PETR4) e não
 * preferencial/nota/ETN do emissor? Classe = mesma raiz com sufixo de classe (BRK-A/BRK-B), ou um é
 * o principal + 1 letra de classe (GOOGL/GOOG, FOXA/FOX), ou mesmo tamanho mudando só a última letra,
 * as duas de classe (LBRDA/LBRDK). Ficam fora: JPM-PC, AMJB/VYLD (ETNs do JPM), BACRP, GOOGM/GOOGN,
 * DUKB/SREA/CMSA (dívida listada),
 * AGNCM/AGNCP.
 */
export function ehClasseDoPrincipal(principal: string, outro: string): boolean {
  const [raizP, classeP] = principal.split(/[.-]/);
  const [raizO, classeO] = outro.split(/[.-]/);
  if (classeP !== undefined || classeO !== undefined) return raizP === raizO;
  if (raizP.length === raizO.length) {
    return (
      raizP.length >= 4 &&
      raizP.slice(0, -1) === raizO.slice(0, -1) &&
      LETRA_MESMO_TAMANHO.has(raizP.slice(-1)) &&
      LETRA_MESMO_TAMANHO.has(raizO.slice(-1))
    );
  }
  const [curto, longo] = raizP.length < raizO.length ? [raizP, raizO] : [raizO, raizP];
  // o mais longo tem de ser o principal (GOOGL→GOOG, FOXA→FOX, NWSA→NWS): quando o principal é o
  // curto, o longo é título de dívida listado (DUK→DUKB, SRE→SREA, CMS→CMSA, AFG→AFGB, ASB→ASBA)
  if (longo !== raizP) return false;
  return (
    longo.length === curto.length + 1 &&
    longo.startsWith(curto) &&
    LETRAS_CLASSE.has(longo.slice(-1))
  );
}

/**
 * Tickers que viram linha na Análise: só NYSE/Nasdaq, no formato de ação (RE_TICKER_EUA), na ordem
 * do arquivo (o primeiro é o principal), sem repetição, e os demais só se forem classe do principal.
 */
export function tickersListados(tickers: readonly TickerSec[]): TickerSec[] {
  const vistos = new Set<string>();
  const out: TickerSec[] = [];
  for (const t of tickers) {
    const s = t.symbol.trim().toUpperCase();
    if (!ehBolsa(t.bolsa) || !s || vistos.has(s) || normalizarTickerEua(s) === '') continue;
    if (!ehTickerEua(symbolAnaliseDaSec(s))) continue;
    if (out.length > 0 && !ehClasseDoPrincipal(out[0].symbol, s)) continue;
    vistos.add(s);
    out.push({ symbol: s, bolsa: t.bolsa });
  }
  return out;
}

export function decidirUniverso(
  c: CandidatoUniverso,
  params: UniversoEuaParams,
  override: OverrideCikEua | null,
): DecisaoUniverso {
  const cik = normalizarCik(c.cik);
  const alertas: DecisaoUniverso['alertas'] = [];
  const classe: ClasseEua = override?.classe ?? (c.sic === SIC_REIT ? 'reit' : 'stock');
  const ehReit = classe === 'reit';
  const reitTipo: TipoReit | null = ehReit ? (override?.reitTipo ?? 'equity') : null;
  const segmento = ehReit ? (override?.segmento ?? segmentoCuradoReit(cik)) : null;
  const ehFinanceira =
    override?.ehFinanceira ?? (!ehReit && (c.sic === null || ehSicFinanceira(c.sic)));
  const bolsa = bolsaDoCandidato(c.tickers);
  const cikHistorico = override?.cikHistorico ? normalizarCik(override.cikHistorico) : null;
  const floatSanidade =
    c.publicFloatUsd !== null
      ? sanidadeFloat(
          c.publicFloatUsd,
          { acoesEmCirculacao: c.acoesEmCirculacao, ativoTotalUsd: c.ativoTotalUsd },
          params.sanidadeFloat,
        )
      : null;
  const corte = params[classe];
  const minimo = c.noUniversoAnterior ? corte.floatSaidaUsd : corte.floatEntradaUsd;

  let foraMotivo: ForaMotivoEua | null = null;
  if (override?.acao === 'excluir') {
    foraMotivo = reitTipo === 'mortgage' ? 'hipotecario' : 'override';
  } else if (!bolsa) {
    foraMotivo = 'sem_bolsa';
  } else if (c.sic !== null && SICS_FORA_EUA.includes(c.sic) && override?.acao !== 'incluir') {
    foraMotivo = 'sic_fora';
  } else if (!c.tem10k && !cikHistorico) {
    foraMotivo = 'sem_10k';
  } else if (c.publicFloatUsd === null) {
    // CIK incluído por override sem float conhecido entra; o resto fica fora
    if (override?.acao !== 'incluir') foraMotivo = 'float_abaixo';
  } else if (floatSanidade !== 'ok') {
    foraMotivo = 'float_suspeito';
  } else if (c.publicFloatUsd < minimo) {
    foraMotivo = 'float_abaixo';
  }

  const passaFloat = c.publicFloatUsd !== null && c.publicFloatUsd >= minimo;
  if (floatSanidade !== null && floatSanidade !== 'ok') {
    alertas.push({
      codigo: 'float_suspeito',
      mensagem: `free float US$ ${c.publicFloatUsd} (${floatSanidade}) — fora do universo`,
    });
  }
  if (override?.acao === 'incluir' && !bolsa) {
    alertas.push({
      codigo: 'override_sem_ticker',
      mensagem:
        'override de inclusão sem ticker NYSE/Nasdaq nos arquivos da SEC — fica fora (o override nunca fixa ticker)',
    });
  }
  if (!c.tem10k && passaFloat && bolsa && override?.acao !== 'excluir') {
    alertas.push({
      codigo: 'ticker_sem_10k',
      mensagem: cikHistorico
        ? `CIK sem 10-K; histórico no CIK ${cikHistorico}`
        : 'CIK sem 10-K (histórico em CIK predecessor?) — fora até um override',
    });
  }
  if (foraMotivo === null && c.sic === null && !ehReit && override?.ehFinanceira === undefined) {
    alertas.push({
      codigo: 'sem_sic',
      mensagem: 'CIK sem SIC na SEC (BDC/fundo?) — entra como financeira',
    });
  }
  if (foraMotivo === null && ehReit && !override && !segmento) {
    alertas.push({
      codigo: 'reit_por_sic_suspeito',
      mensagem: 'REIT só pelo SIC 6798, sem segmento curado — conferir se é de patrimônio',
    });
  } else if (foraMotivo === null && ehReit && !segmento) {
    alertas.push({ codigo: 'reit_sem_segmento', mensagem: 'REIT sem segmento curado' });
  }

  return {
    cik,
    classe,
    ehReit,
    reitTipo,
    segmento,
    ehFinanceira,
    bolsa,
    floatSanidade,
    noUniverso: foraMotivo === null,
    foraMotivo,
    origem: override ? 'override' : 'regra',
    cikHistorico,
    alertas,
  };
}

/** Menor corte de saída entre as classes (filtro de candidatos antes do submissions). */
export function menorCorteBusca(params: UniversoEuaParams): number {
  return Math.min(params.stock.floatSaidaUsd, params.reit.floatSaidaUsd);
}
