/**
 * Múltiplos anuais e atuais (spec §4.5; regras 4, 5, 15 e decisões 13 e 19). Funções puras.
 *
 * - Histórico: preço CRU do último pregão do ano × ações da MESMA data ÷ métrica (WEGE3 2024: 52,77 ×
 *   4.195,54 mi ÷ 6.042,6 mi = 36,6; nunca o 34,7 da BRAPI).
 * - Por ticker (decisão 13): P/L = preço_ticker ÷ (LPA_empresa × fatorEquivalencia), com LPA_empresa =
 *   lucro atribuível ÷ ações totais ex-tesouraria; units usam o fator (TAEE11 = 1 ON + 2 PN = 3).
 *   EV usa o valor de mercado da EMPRESA (Σ classes preço × ações).
 * - Base ≤ 0 ⇒ "não se aplica" (base_nao_positiva), nunca múltiplo negativo (regra 4).
 * - Financeiras (EmissorInfo.ehFinanceira): EBITDA, EV/EBITDA, DL/EBITDA, DL/PL, ROIC e liquidez
 *   corrente ⇒ n/a('financeira') (regra 15). Receita ≤ 0 ou menor que o lucro (holdings) ⇒ margem e
 *   P/Receita n/a.
 * - Atual: TTM (linha tipoPeriodo='TTM' gravada pela fatia A); média de 10 anos do P/L só com pontos
 *   > 0 e no mínimo 5 (regra 7).
 */
import {
  ausente,
  combinar,
  deNumero,
  naoSeAplica,
  ok,
} from '@/services/analiseAtivos/regras/comum/valor';
import type { FundamentosPeriodo, ScoringParams, Valor } from '@/services/analiseAtivos/tipos';

/** Alíquota nominal de IR+CSLL usada no NOPAT do ROIC (aproximação; relatório da Fase A §2.1). */
const ALIQUOTA_NOPAT = 0.34;

export type BaseFundamentos = Pick<
  FundamentosPeriodo,
  | 'receita'
  | 'lucroLiquido'
  | 'lucroAtribuivel'
  | 'ebit'
  | 'depreciacaoAmortizacao'
  | 'ativoTotal'
  | 'ativoCirculante'
  | 'passivoCirculante'
  | 'caixa'
  | 'aplicacoesFinanceiras'
  | 'dividaBrutaCp'
  | 'dividaBrutaLp'
  | 'pl'
  | 'plControladora'
  | 'fco'
  | 'capex'
  | 'naoSeAplica'
  | 'flags'
>;

export interface EntradaMultiplosAcao {
  classe: 'acao';
  /** preço cru do ticker (mesma data das ações) */
  preco: number | null;
  /** ações totais da empresa ex-tesouraria na data */
  acoesTotais: number | null;
  /** 1 para ON/PN; on+pn para units */
  fatorEquivalencia: number;
  /** Σ classes (preço × ações da classe); null ⇒ usa preço × ações ÷ fator */
  valorMercadoEmpresa: number | null;
  fund: BaseFundamentos;
  /** DPA do ticker na mesma base do preço (ano: data-com no ano; atual: 12 meses) */
  dpa: Valor<number>;
  /** payout já calculado (ano: DMPL ÷ lucro, decisão 11) */
  payoutPct?: Valor<number>;
  ehFinanceira: boolean;
}

export interface EntradaMultiplosFii {
  classe: 'fii';
  preco: number | null;
  vpCota: number | null;
  /** rendimento por cota na mesma base do preço (ano ou 12 meses) */
  rendCota: Valor<number>;
  obrigacoesPlPct: number | null;
  vacanciaFisicaCvmPct: number | null;
  nImoveisCvm: number | null;
  pl: number | null;
}

export type NomeMultiplo =
  | 'lpa'
  | 'vpa'
  | 'pl'
  | 'pvp'
  | 'pReceita'
  | 'evEbitda'
  | 'pFco'
  | 'pFcl'
  | 'dyPct'
  | 'payoutPct'
  | 'margemLiquidaPct'
  | 'roePct'
  | 'roaPct'
  | 'roicPct'
  | 'divLiqEbitda'
  | 'divLiqPl'
  | 'liquidezCorrente'
  | 'dividaLiquida'
  | 'ebitda'
  | 'valorMercadoEmpresa'
  | 'vpCota'
  | 'rendCota'
  | 'obrigacoesPlPct'
  | 'vacanciaFisicaCvmPct'
  | 'nImoveisCvm';

export type MultiplosCalculados = Partial<Record<NomeMultiplo, Valor<number>>> & {
  flags: string[];
};

function v(n: number | null | undefined): Valor<number> {
  return deNumero(n);
}

/** a ÷ b com base ≤ 0 ⇒ n/a; qualquer lado ausente ⇒ ausente. */
function razao(a: Valor<number>, b: Valor<number>, escala = 1): Valor<number> {
  if (a.estado === 'nao_se_aplica') return a;
  if (b.estado === 'nao_se_aplica') return b;
  if (a.estado === 'ausente') return a;
  if (b.estado === 'ausente') return b;
  if (!(b.valor > 0)) return naoSeAplica('base_nao_positiva');
  return ok((a.valor / b.valor) * escala);
}

function somaOuNull(...xs: Array<number | null>): number | null {
  if (xs.every((x) => x === null)) return null;
  return xs.reduce<number>((s, x) => s + (x ?? 0), 0);
}

/** Dívida líquida = dívida bruta (CP + LP) − (caixa + aplicações). Sem caixa informado ⇒ ausente. */
export function dividaLiquida(f: BaseFundamentos): Valor<number> {
  const caixa = somaOuNull(f.caixa, f.aplicacoesFinanceiras);
  if (caixa === null) return ausente('sem_dado_fonte', 'caixa');
  const bruta = somaOuNull(f.dividaBrutaCp, f.dividaBrutaLp) ?? 0;
  return ok(bruta - caixa);
}

/** EBITDA = EBIT + D&A (D&A do DFC). Sem EBIT ⇒ ausente; financeira ⇒ n/a. */
export function ebitda(f: BaseFundamentos, ehFinanceira: boolean): Valor<number> {
  if (ehFinanceira) return naoSeAplica('financeira');
  if (f.naoSeAplica.includes('ebit')) return naoSeAplica('financeira', 'layout');
  if (f.ebit === null) return ausente('sem_dado_fonte', 'ebit');
  return ok(f.ebit + (f.depreciacaoAmortizacao ?? 0));
}

function regraReceita(f: BaseFundamentos): Valor<number> {
  if (f.receita === null) return ausente('sem_dado_fonte', 'receita');
  if (f.naoSeAplica.includes('receita')) return naoSeAplica('receita_nao_positiva');
  if (!(f.receita > 0)) return naoSeAplica('receita_nao_positiva');
  const lucro = f.lucroLiquido ?? f.lucroAtribuivel;
  if (lucro !== null && f.receita < lucro) return naoSeAplica('receita_menor_que_lucro');
  return ok(f.receita);
}

/** Métrica por ação (do ticker): métrica ÷ ações totais × fator de equivalência. */
function porAcao(m: Valor<number>, acoes: number | null, fator: number): Valor<number> {
  if (m.estado !== 'ok') return m;
  if (acoes === null || !(acoes > 0)) return ausente('sem_acoes');
  return ok((m.valor / acoes) * fator);
}

function comPreco(preco: number | null): Valor<number> {
  return preco !== null && preco > 0 ? ok(preco) : ausente('sem_preco');
}

function mapearEbit(f: BaseFundamentos): Valor<number> {
  return f.ebit === null ? ausente('sem_dado_fonte', 'ebit') : ok(f.ebit * (1 - ALIQUOTA_NOPAT));
}

export function multiplosAcao(e: EntradaMultiplosAcao): MultiplosCalculados {
  const f = e.fund;
  const flags: string[] = [];
  const preco = comPreco(e.preco);
  const lucroAtr: Valor<number> =
    f.lucroAtribuivel === null
      ? ausente(f.flags.includes('controladora_zero') ? 'controladora_zero' : 'sem_dado_fonte')
      : ok(f.lucroAtribuivel);
  const plCtrl = v(f.plControladora ?? f.pl);
  const lpa = porAcao(lucroAtr, e.acoesTotais, e.fatorEquivalencia);
  const vpa = porAcao(plCtrl, e.acoesTotais, e.fatorEquivalencia);
  const receita = regraReceita(f);
  const eb = ebitda(f, e.ehFinanceira);
  const dl = e.ehFinanceira ? naoSeAplica('financeira') : dividaLiquida(f);
  const fco = v(f.fco);
  const fcl = combinar(fco, v(f.capex), (a, c) => a - c);

  let vm: Valor<number>;
  if (e.valorMercadoEmpresa !== null && e.valorMercadoEmpresa > 0) vm = ok(e.valorMercadoEmpresa);
  else if (preco.estado === 'ok' && e.acoesTotais && e.acoesTotais > 0) {
    vm = ok((preco.valor * e.acoesTotais) / (e.fatorEquivalencia || 1));
  } else vm = preco.estado === 'ok' ? ausente('sem_acoes') : preco;

  const ev = combinar(vm, dl, (a, b) => a + b);

  if (plCtrl.estado === 'ok' && plCtrl.valor <= 0) flags.push('pl_nao_positivo');
  if (lucroAtr.estado === 'ok' && lucroAtr.valor <= 0) flags.push('lucro_nao_positivo');

  const lucroParaMargem = v(f.lucroLiquido ?? f.lucroAtribuivel);
  // ROIC aproximado: NOPAT (EBIT × (1 − 34%)) ÷ capital investido (PL total + dívida líquida)
  const capitalInvestido = combinar(v(f.pl ?? f.plControladora), dl, (a, b) => a + b);
  const nopat = mapearEbit(f);

  return {
    lpa,
    vpa,
    pl: razao(preco, lpa),
    pvp: razao(preco, vpa),
    pReceita:
      receita.estado === 'ok'
        ? razao(preco, porAcao(receita, e.acoesTotais, e.fatorEquivalencia))
        : receita,
    evEbitda: e.ehFinanceira ? naoSeAplica('financeira') : razao(ev, eb),
    pFco: razao(preco, porAcao(fco, e.acoesTotais, e.fatorEquivalencia)),
    pFcl: razao(preco, porAcao(fcl, e.acoesTotais, e.fatorEquivalencia)),
    dyPct: razao(e.dpa, preco, 100),
    payoutPct: e.payoutPct ?? ausente('outro', 'payout_nao_informado'),
    margemLiquidaPct: receita.estado === 'ok' ? razao(lucroParaMargem, receita, 100) : receita,
    roePct: razao(lucroAtr, plCtrl, 100),
    roaPct: razao(lucroParaMargem, v(f.ativoTotal), 100),
    roicPct: e.ehFinanceira ? naoSeAplica('financeira') : razao(nopat, capitalInvestido, 100),
    divLiqEbitda: e.ehFinanceira ? naoSeAplica('financeira') : razao(dl, eb),
    divLiqPl: e.ehFinanceira ? naoSeAplica('financeira') : razao(dl, plCtrl),
    liquidezCorrente:
      e.ehFinanceira || f.naoSeAplica.includes('ativoCirculante')
        ? naoSeAplica('financeira')
        : razao(v(f.ativoCirculante), v(f.passivoCirculante)),
    dividaLiquida: dl,
    ebitda: eb,
    valorMercadoEmpresa: vm,
    flags,
  };
}

export function multiplosFii(e: EntradaMultiplosFii): MultiplosCalculados {
  const preco = comPreco(e.preco);
  const flags: string[] = [];
  if (e.pl !== null && e.pl <= 0) flags.push('pl_nao_positivo');
  return {
    vpCota: v(e.vpCota),
    rendCota: e.rendCota,
    pvp: razao(preco, v(e.vpCota)),
    dyPct: razao(e.rendCota, preco, 100),
    obrigacoesPlPct: v(e.obrigacoesPlPct),
    vacanciaFisicaCvmPct: v(e.vacanciaFisicaCvmPct),
    nImoveisCvm: v(e.nImoveisCvm),
    flags,
  };
}

/** Múltiplos de um ano fiscal (histórico da barra de posição). */
export function multiplosAnuais(
  e: EntradaMultiplosAcao | EntradaMultiplosFii,
  _p: ScoringParams,
): MultiplosCalculados {
  return e.classe === 'acao' ? multiplosAcao(e) : multiplosFii(e);
}

export interface HistoricoPl {
  plMedia10a: Valor<number>;
  plPontosHistorico: number;
  plVsMedia10aPct: Valor<number>;
}

/**
 * P/L atual contra a média dos últimos 10 exercícios (decisão 10; regra 7): só pontos > 0; menos de
 * `minPontosHistorico` ⇒ ausente('historico_curto'); P/L atual n/a (prejuízo) ⇒ n/a.
 */
export function plContraMedia10a(
  plAtual: Valor<number>,
  historico: Array<{ anoFiscal: number; pl: Valor<number> }>,
  p: ScoringParams,
): HistoricoPl {
  const minimo = p.acao.componentes.preco.minPontosHistorico ?? p.valuation.barra.minPontos;
  const ultimos = [...historico].sort((a, b) => b.anoFiscal - a.anoFiscal).slice(0, 10);
  const pontos = ultimos
    .map((h) => (h.pl.estado === 'ok' ? h.pl.valor : null))
    .filter((x): x is number => x !== null && x > 0);
  const n = pontos.length;
  if (n < minimo) {
    return {
      plMedia10a: ausente('historico_curto', `${n} pontos`),
      plPontosHistorico: n,
      plVsMedia10aPct:
        plAtual.estado === 'nao_se_aplica' ? plAtual : ausente('historico_curto', `${n} pontos`),
    };
  }
  const media = pontos.reduce((a, b) => a + b, 0) / n;
  const vs: Valor<number> =
    plAtual.estado === 'ok' ? ok(((plAtual.valor - media) / Math.abs(media)) * 100) : plAtual;
  return { plMedia10a: ok(media), plPontosHistorico: n, plVsMedia10aPct: vs };
}

export type EntradaMultiplosAtuais = (EntradaMultiplosAcao | EntradaMultiplosFii) & {
  historicoPl?: Array<{ anoFiscal: number; pl: Valor<number> }>;
};

/** Múltiplos do dia (TTM) + P/L contra a média de 10 anos (ações). */
export function multiplosAtuais(
  e: EntradaMultiplosAtuais,
  p: ScoringParams,
): MultiplosCalculados & Partial<HistoricoPl> {
  const m = multiplosAnuais(e, p);
  if (e.classe !== 'acao') return m;
  const h = plContraMedia10a(m.pl ?? ausente('sem_dado_fonte'), e.historicoPl ?? [], p);
  return { ...m, ...h };
}

/**
 * Três estados → colunas de banco: valor numérico (null quando não ok) + lista `naoSeAplica` com o
 * nome das colunas n/a (null fora da lista = ausente; 0 = zero de verdade).
 */
export function achatarValores<K extends string>(
  valores: Partial<Record<K, Valor<number> | undefined>>,
): { colunas: Record<K, number | null>; naoSeAplica: string[] } {
  const colunas = {} as Record<K, number | null>;
  const na: string[] = [];
  for (const [k, val] of Object.entries(valores) as Array<[K, Valor<number> | undefined]>) {
    if (!val) {
      colunas[k] = null;
      continue;
    }
    colunas[k] = val.estado === 'ok' && Number.isFinite(val.valor) ? val.valor : null;
    if (val.estado === 'nao_se_aplica') na.push(k);
  }
  return { colunas, naoSeAplica: na.sort() };
}
