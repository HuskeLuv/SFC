/**
 * Séries anuais de AÇÕES para os Filtros de Fundamentos (fatia A), a partir do banco (DFP da CVM,
 * AssetFundamentalsPeriod FY). Mesmas fontes e regras do Essencial e do motor de múltiplos:
 *  - FY vigente: maior versão por (emissor, dtFim, escopo); escopo preferido do emissor (individual
 *    para bancos, decisão 3); um FY por ano fiscal (o de dtFim mais recente) — a regra de
 *    repositorio/acoes.fundamentosVigentes, lendo SÓ as colunas usadas (lotes de 50 no job);
 *  - revenue = FY.receita; net_income = lucro atribuível aos controladores (lucroParaSequencia,
 *    regra 12: controladora_zero ⇒ o do individual) — D2;
 *  - receita ≤ 0 = ausente; ebitda = EBIT + D&A (multiplos.ebitda); net_margin = lucro ÷ receita.
 *    Receita ≤ lucro (holding, banco no individual): params.criterios.margem.receitaMenorQueLucro —
 *    'sem_dado' (regra 15 da v2.4, padrão) ou 'valor' (literal da spec na v2: margem > 100% atende);
 *  - net_debt_ebitda = (dívida bruta − caixa − aplicações) ÷ EBITDA (multiplos.dividaLiquida); EBITDA ≤ 0
 *    com DL ≤ 0 = 0 (caixa líquido, dentro); EBITDA ≤ 0 com DL > 0 = +Infinity (avaliarCriterio:
 *    'EBITDA ≤ 0 em AAAA');
 *  - free_cash_flow = FCO − CAPEX (NUNCA o campo fcf, que é o fluxo de financiamento).
 * Nomes de série = os canônicos da spec (v2.5, SERIES_CRITERIO).
 * Valores em R$ mi (margem em %, Dív/EBITDA em ×). Ano com o grupo 'fundamentos_escala' em
 * conferência (bloco C, chave com o ano) = ausente em todas as séries.
 *
 * fundamentei-regras (F1):
 *  - série 'ebit' (critério 'ebitda' da v5, mesmo id) = FY.ebit (lucro operacional, R$ mi), FORA
 *    das saídas de hoje: valoresAnoAcao/seriesAcao ficam idênticos; quem quer a série usa
 *    valoresAnoAcaoComEbit (FonteCvm com incluirEbit);
 *  - margem por perfil (opcoesSeriesAcaoDoPerfil): o override
 *    criterios.margem.porPerfil.acao_financeira ('nao_se_aplica' na v5) grava a margem NULA nos
 *    anos de receita ≤ lucro da financeira (o motor marca o 'mg' como não se aplica); sem o
 *    override (v1–v4) é a regra global de antes.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  anosEmConferencia,
  flagsAnuaisConf,
} from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import { paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import {
  dividaLiquida,
  ebitda,
  type BaseFundamentos,
} from '@/services/analiseAtivos/regras/calculo/multiplos';
import {
  regraMargemDoPerfil,
  type CriteriaParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { lucroParaSequencia } from '@/services/analiseAtivos/regras/calculo/sequencias';
import type { Escopo } from '@/services/analiseAtivos/tipos';
import type { PerfilCriterio, SerieCriterio } from '@/types/analiseAtivosCriterios';

export type SeriesCriterios = Partial<Record<SerieCriterio, Record<number, number | null>>>;

/** Linha FY bruta (só as colunas que os critérios usam; números já convertidos). */
export interface FyBrutoCriterios {
  emissorId: string;
  dtFim: string;
  escopo: Escopo;
  versao: number;
  anoFiscal: number;
  receita: number | null;
  ebit: number | null;
  depreciacaoAmortizacao: number | null;
  lucroLiquido: number | null;
  lucroAtribuivel: number | null;
  caixa: number | null;
  aplicacoesFinanceiras: number | null;
  dividaBrutaCp: number | null;
  dividaBrutaLp: number | null;
  fco: number | null;
  capex: number | null;
  naoSeAplica: string[];
  flags: string[];
}

export interface FyCriterios extends FyBrutoCriterios {
  /** regra 12: lucro do individual quando o consolidado tem controladora_zero */
  lucroAtribuivelIndividual: number | null;
}

/** Entrada pura de uma empresa (também o formato da fixture do DEV). */
export interface BrutoAcao {
  cnpj: string;
  ehFinanceira: boolean;
  escopoPreferido: Escopo;
  fys: FyBrutoCriterios[];
  /** flags 'conf:' da empresa (linhas anuais com o ano na chave + linha atual) */
  flagsConf: string[];
}

/** Um FY vigente por ano fiscal (mesma regra de fundamentosVigentes + umFyPorAno). */
export function fysVigentesPorAno(
  linhas: readonly FyBrutoCriterios[],
  escopoPreferido: Escopo,
): Map<number, FyCriterios> {
  const vigentes = new Map<string, FyBrutoCriterios>();
  for (const l of linhas) {
    const k = `${l.dtFim}|${l.escopo}`;
    const atual = vigentes.get(k);
    if (!atual || l.versao > atual.versao) vigentes.set(k, l);
  }
  const porPeriodo = new Map<string, FyBrutoCriterios[]>();
  for (const l of vigentes.values()) {
    const lista = porPeriodo.get(l.dtFim);
    if (lista) lista.push(l);
    else porPeriodo.set(l.dtFim, [l]);
  }
  const porAno = new Map<number, FyCriterios>();
  for (const grupo of porPeriodo.values()) {
    const escolhida = grupo.find((g) => g.escopo === escopoPreferido) ?? grupo[0];
    const ind = grupo.find((g) => g.escopo === 'ind');
    const f: FyCriterios = {
      ...escolhida,
      lucroAtribuivelIndividual:
        escolhida.escopo === 'con' &&
        escolhida.lucroAtribuivel === null &&
        escolhida.flags.includes('controladora_zero') &&
        ind
          ? ind.lucroAtribuivel
          : null,
    };
    const atual = porAno.get(f.anoFiscal);
    if (!atual || f.dtFim > atual.dtFim) porAno.set(f.anoFiscal, f);
  }
  return porAno;
}

const emMi = (n: number | null): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? n / 1e6 : null;

/** Regras finas das séries de ação vindas do criteria_params (padrões = v2.4). */
export interface OpcoesSeriesAcao {
  /** receita ≤ lucro: 'sem_dado' (regra 15, v2.4) | 'valor' (literal da spec, v2) */
  receitaMenorQueLucro?: 'valor' | 'sem_dado';
}

/** Opções das séries de ação a partir dos params (criterios.margem). */
export function opcoesSeriesAcao(params: {
  criterios: { margem: { receitaMenorQueLucro: 'valor' | 'sem_dado' } };
}): OpcoesSeriesAcao {
  return { receitaMenorQueLucro: params.criterios.margem.receitaMenorQueLucro };
}

/**
 * Opções das séries de ação de UM perfil (fundamentei-regras F1): a regra da margem do perfil
 * (regraMargemDoPerfil). 'nao_se_aplica' grava a margem nula nos anos de receita ≤ lucro (como
 * 'sem_dado'); o motor decide o n/a. Sem override = opcoesSeriesAcao (v1–v4 iguais).
 */
export function opcoesSeriesAcaoDoPerfil(
  params: Pick<CriteriaParams, 'criterios'>,
  perfil: PerfilCriterio,
): OpcoesSeriesAcao {
  const regra = regraMargemDoPerfil(params, perfil);
  return { receitaMenorQueLucro: regra === 'nao_se_aplica' ? 'sem_dado' : regra };
}

/** Valores de um FY (R$ mi, %, ×). Pura. */
export function valoresAnoAcao(
  f: FyCriterios,
  opcoes: OpcoesSeriesAcao = {},
): Record<
  'revenue' | 'net_income' | 'ebitda' | 'net_margin' | 'net_debt_ebitda' | 'free_cash_flow',
  number | null
> {
  const lucroV = lucroParaSequencia(f);
  const lucro = lucroV.estado === 'ok' ? lucroV.valor : null;
  // receita ≤ 0 (ou marcada 'não se aplica' na ingestão) = ausente, como no regraReceita dos múltiplos
  const receita =
    typeof f.receita === 'number' && f.receita > 0 && !f.naoSeAplica.includes('receita')
      ? f.receita
      : null;
  // colunas que EBITDA e dívida líquida não leem ficam nulas (a leitura do job não as traz)
  const base: BaseFundamentos = {
    ...f,
    ativoTotal: null,
    ativoCirculante: null,
    passivoCirculante: null,
    pl: null,
    plControladora: null,
  };
  const eb = ebitda(base, false);
  const dl = dividaLiquida(base);
  let dlEbitda: number | null = null;
  if (eb.estado === 'ok' && dl.estado === 'ok') {
    if (eb.valor > 0) dlEbitda = dl.valor / eb.valor;
    else dlEbitda = dl.valor > 0 ? Number.POSITIVE_INFINITY : 0;
  }
  return {
    revenue: emMi(receita),
    net_income: emMi(lucro),
    ebitda: eb.estado === 'ok' ? emMi(eb.valor) : null,
    // receita ≤ lucro (holding / banco no individual): na v2.4 ausente (regra 15,
    // receita_menor_que_lucro, a mesma dos múltiplos e do Essencial); na v2 o valor (literal)
    net_margin:
      lucro !== null &&
      receita !== null &&
      (receita > lucro || opcoes.receitaMenorQueLucro === 'valor')
        ? (lucro / receita) * 100
        : null,
    net_debt_ebitda: dlEbitda,
    free_cash_flow: f.fco !== null && f.capex !== null ? emMi(f.fco - f.capex) : null,
  };
}

/** valoresAnoAcao + 'ebit' (lucro operacional, R$ mi; fundamentei-regras F1). Pura. */
export function valoresAnoAcaoComEbit(
  f: FyCriterios,
  opcoes: OpcoesSeriesAcao = {},
): ReturnType<typeof valoresAnoAcao> & { ebit: number | null } {
  return { ...valoresAnoAcao(f, opcoes), ebit: emMi(f.ebit) };
}

/** Séries anuais de uma empresa. Pura (series.test usa a fixture real do DEV). */
export function seriesAcao(b: BrutoAcao, opcoes: OpcoesSeriesAcao = {}): SeriesCriterios {
  const porAno = fysVigentesPorAno(b.fys, b.escopoPreferido);
  const emConf = anosEmConferencia(b.flagsConf, 'fundamentos_escala');
  const out: Required<
    Pick<
      SeriesCriterios,
      'revenue' | 'net_income' | 'ebitda' | 'net_margin' | 'net_debt_ebitda' | 'free_cash_flow'
    >
  > = {
    revenue: {},
    net_income: {},
    ebitda: {},
    net_margin: {},
    net_debt_ebitda: {},
    free_cash_flow: {},
  };
  for (const [ano, f] of porAno) {
    const v = valoresAnoAcao(f, opcoes);
    const conf = emConf.has(ano);
    for (const k of Object.keys(out) as Array<keyof typeof out>) {
      out[k][ano] = conf ? null : v[k];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Leitura do banco (job 'criterios' e exportar-fixtures-criterios)
// ---------------------------------------------------------------------------

const SELECT_FY = {
  emissorId: true,
  dtFim: true,
  escopo: true,
  versao: true,
  anoFiscal: true,
  receita: true,
  ebit: true,
  depreciacaoAmortizacao: true,
  lucroLiquido: true,
  lucroAtribuivel: true,
  caixa: true,
  aplicacoesFinanceiras: true,
  dividaBrutaCp: true,
  dividaBrutaLp: true,
  fco: true,
  capex: true,
  naoSeAplica: true,
  flags: true,
} satisfies Prisma.AssetFundamentalsPeriodSelect;

export interface EmpresaCriterios {
  cnpj: string;
  ehFinanceira: boolean;
  escopoPreferido: Escopo;
  /** tickers vigentes da empresa (flags 'conf:' lidas por símbolo) */
  symbols: string[];
}

/** Brutos de um lote de empresas (FY desde `desdeAno` + flags 'conf:' da empresa). */
export async function lerBrutosAcoes(
  prisma: PrismaClient,
  empresas: readonly EmpresaCriterios[],
  desdeAno: number,
): Promise<Map<string, BrutoAcao>> {
  const out = new Map<string, BrutoAcao>();
  if (empresas.length === 0) return out;
  const cnpjs = empresas.map((e) => e.cnpj);
  const symbols = empresas.flatMap((e) => e.symbols);
  const [fys, anuais, atuais] = await Promise.all([
    prisma.assetFundamentalsPeriod.findMany({
      where: { emissorId: { in: cnpjs }, tipoPeriodo: 'FY', anoFiscal: { gte: desdeAno } },
      select: SELECT_FY,
    }),
    prisma.assetMultiplesYearly.findMany({
      where: { symbol: { in: symbols }, NOT: { flags: { isEmpty: true } } },
      select: { symbol: true, anoFiscal: true, flags: true },
    }),
    prisma.assetMultiplesCurrent.findMany({
      where: { symbol: { in: symbols }, NOT: { flags: { isEmpty: true } } },
      select: { symbol: true, flags: true },
    }),
  ]);
  const cnpjDe = new Map(empresas.flatMap((e) => e.symbols.map((s) => [s, e.cnpj] as const)));
  for (const e of empresas) {
    out.set(e.cnpj, {
      cnpj: e.cnpj,
      ehFinanceira: e.ehFinanceira,
      escopoPreferido: e.escopoPreferido,
      fys: [],
      flagsConf: [],
    });
  }
  for (const l of fys) {
    out.get(l.emissorId)?.fys.push({
      emissorId: l.emissorId,
      dtFim: paraData(l.dtFim),
      escopo: l.escopo as Escopo,
      versao: l.versao,
      anoFiscal: l.anoFiscal,
      receita: paraNumero(l.receita),
      ebit: paraNumero(l.ebit),
      depreciacaoAmortizacao: paraNumero(l.depreciacaoAmortizacao),
      lucroLiquido: paraNumero(l.lucroLiquido),
      lucroAtribuivel: paraNumero(l.lucroAtribuivel),
      caixa: paraNumero(l.caixa),
      aplicacoesFinanceiras: paraNumero(l.aplicacoesFinanceiras),
      dividaBrutaCp: paraNumero(l.dividaBrutaCp),
      dividaBrutaLp: paraNumero(l.dividaBrutaLp),
      fco: paraNumero(l.fco),
      capex: paraNumero(l.capex),
      naoSeAplica: l.naoSeAplica,
      flags: l.flags,
    });
  }
  // grupo 'fundamentos_escala' tem escopo EMPRESA: a flag de qualquer ticker vale para a empresa
  for (const l of anuais) {
    const b = out.get(cnpjDe.get(l.symbol) ?? '');
    if (b) b.flagsConf.push(...flagsAnuaisConf([l]));
  }
  for (const l of atuais) {
    const b = out.get(cnpjDe.get(l.symbol) ?? '');
    if (b) b.flagsConf.push(...l.flags.filter((f) => f.startsWith('conf:')));
  }
  for (const b of out.values()) b.flagsConf = [...new Set(b.flagsConf)].sort();
  return out;
}
