/**
 * Etapas 4–6 do job scores: múltiplos atuais de todo o universo (AssetMultiplesCurrent), Índice MF +
 * semáforo (AssetScore) e retenção de asset_scores.
 *
 * - dataRef = último pregão com cotação (max AssetQuoteResumo.ultimoPregao), nunca o dia do run: runs
 *   de sábado/domingo regravam a mesma chave (symbol, dataRef).
 * - Ações (decisão 13): Índice POR EMPRESA, calculado no ticker de referência (maior volume médio de
 *   21 pregões) e replicado aos demais; DY e P/L por ticker ficam em AssetMultiplesCurrent.
 * - FIIs: régua = FiiMonthly.reguaVigente (fatia B); FoF e PL ≤ 0 fora do Índice; ticker não conferido
 *   no FiiTickerMap não recebe score (params.fii.exigirTickerConferido) e entra na contagem do run.
 */
import type { Prisma } from '@prisma/client';
import type { EventoComCnpj } from '@/services/analiseAtivos/calculo/recalcularEventos';
import {
  aplicarRetencaoScores,
  gravarMultiplosAtuais,
  gravarScores,
  lerPlAnualGravado,
} from '@/services/analiseAtivos/calculo/gravarDerivados';
import {
  fatorEquivalencia,
  umFyPorAno,
  valorMercadoEmpresa,
  type MemoriaCalculo,
} from '@/services/analiseAtivos/calculo/recalcularDerivados';
import {
  agrupar,
  type DadosBase,
  type FiiMesEnxuto,
} from '@/services/analiseAtivos/calculo/universo';
import {
  calcularIndiceComParams,
  componentesIndiceAcao,
  componentesIndiceFii,
  NOMES_COMPONENTES,
  type ComponentesIndice,
  type ResultadoIndiceCalc,
} from '@/services/analiseAtivos/regras/calculo/indiceMf';
import {
  achatarValores,
  multiplosAtuais,
  type MultiplosCalculados,
  type HistoricoPl,
} from '@/services/analiseAtivos/regras/calculo/multiplos';
import {
  rendimento12m,
  valorProventosComCobertura,
  type ProventoAuditadoCompleto,
} from '@/services/analiseAtivos/regras/calculo/proventos';
import { semaforo, type ResultadoSemaforo } from '@/services/analiseAtivos/regras/calculo/semaforo';
import {
  anosLucroConsecutivosDetalhado,
  lucroParaSequencia,
  mesesComRendimentoDetalhado,
} from '@/services/analiseAtivos/regras/calculo/sequencias';
import { pregaoAnterior } from '@/services/analiseAtivos/regras/comum/pregoes';
import { ausente, deNumero, naoSeAplica, ok } from '@/services/analiseAtivos/regras/comum/valor';
import { fundamentosVigentes } from '@/services/analiseAtivos/repositorio/acoes';
import { deData } from '@/services/analiseAtivos/repositorio/conversao';
import { resumoCotacoes } from '@/services/analiseAtivos/repositorio/cotacoes';
import { fiiTrimestralUltimos } from '@/services/analiseAtivos/repositorio/fii';
import { menosMeses } from '@/services/analiseAtivos/regras/calculo/proventos';
import type {
  CoberturaProventos,
  ContagemAcoes,
  EmissorInfo,
  FiiTrimestre,
  FundamentosPeriodo,
  JobContexto,
  MotivoNaoSeAplica,
  Regua,
  ResumoCotacao,
  ScoringParams,
  TickerAcao,
  Valor,
} from '@/services/analiseAtivos/tipos';

/** Último pregão com cotação (≤ hoje). Sem cotação nenhuma: pregão anterior a hoje. */
export function dataRefScores(
  resumos: Pick<ResumoCotacao, 'ultimoPregao'>[],
  hoje: string,
): string {
  let max: string | null = null;
  for (const r of resumos)
    if (r.ultimoPregao <= hoje && (!max || r.ultimoPregao > max)) max = r.ultimoPregao;
  return max ?? pregaoAnterior(hoje);
}

/** TTM (fatia A) com os saldos de balanço completados pelo período de mesma data-fim. */
export function mesclarTtm(
  ttm: FundamentosPeriodo | null,
  balanco: FundamentosPeriodo | null,
): FundamentosPeriodo | null {
  if (!ttm) return balanco;
  if (!balanco) return ttm;
  const saldos = [
    'ativoTotal',
    'ativoCirculante',
    'passivoCirculante',
    'caixa',
    'aplicacoesFinanceiras',
    'dividaBrutaCp',
    'dividaBrutaLp',
    'pl',
    'plControladora',
  ] as const;
  const out: FundamentosPeriodo = { ...ttm };
  for (const k of saldos) if (out[k] === null) out[k] = balanco[k];
  return out;
}

function historicoPlValor(
  lista: Array<{ anoFiscal: number; pl: number | null; plNaoSeAplica: boolean }>,
): Array<{ anoFiscal: number; pl: Valor<number> }> {
  return lista.map((l) => ({
    anoFiscal: l.anoFiscal,
    pl:
      l.pl !== null
        ? ok(l.pl)
        : l.plNaoSeAplica
          ? naoSeAplica('base_nao_positiva')
          : ausente('sem_dado_fonte'),
  }));
}

function comCobertura(
  v: Valor<number>,
  provs: ProventoAuditadoCompleto[],
  cob: CoberturaProventos | undefined,
): Valor<number> {
  return valorProventosComCobertura(v, provs.length > 0, cob ?? null);
}

function componentesJson(c: ComponentesIndice): Prisma.InputJsonValue {
  const out: Record<string, Record<string, unknown>> = {};
  for (const nome of NOMES_COMPONENTES) out[nome] = { ...c[nome] };
  return out as Prisma.InputJsonValue;
}

function notaComponente(
  r: ResultadoIndiceCalc,
  nome: (typeof NOMES_COMPONENTES)[number],
): number | null {
  const c = r.componentes[nome];
  return c.estado === 'nao_se_aplica' ? null : c.nota;
}

export interface EntradaAtualAcao {
  ticker: TickerAcao;
  resumo: ResumoCotacao;
  tickersEmpresa: TickerAcao[];
  resumosEmpresa: Map<string, number>;
  fundAtual: FundamentosPeriodo | null;
  fys: FundamentosPeriodo[];
  contagens: ContagemAcoes[];
  emissor: EmissorInfo | undefined;
  proventos: ProventoAuditadoCompleto[];
  eventos: EventoComCnpj[];
  cobertura: CoberturaProventos | undefined;
  historicoPl: Array<{ anoFiscal: number; pl: number | null; plNaoSeAplica: boolean }>;
  dataRef: string;
}

export interface CalculoAtualAcao {
  m: MultiplosCalculados & Partial<HistoricoPl>;
  anos: Valor<number>;
  /** ano ausente que interrompeu a sequência de lucro (≠ prejuízo) ⇒ Índice incompleto */
  anosLacuna?: number | null;
  lucroUltimoFy: Valor<number>;
  lpaTtm: Valor<number>;
  vpa: Valor<number>;
  dpa12m: Valor<number>;
  payoutPct: Valor<number>;
  plControladora: Valor<number>;
  flags: string[];
}

/** Função pura: múltiplos do dia de um ticker de ação. */
export function calcularAtualAcao(e: EntradaAtualAcao, p: ScoringParams): CalculoAtualAcao {
  const flags: string[] = [];
  const fys = umFyPorAno(e.fys);
  const serieLucro = fys.map((f) => ({
    anoFiscal: f.anoFiscal,
    lucro: lucroParaSequencia(f),
  })) as Array<{ anoFiscal: number; lucro: Valor<number> }>;
  const seq = anosLucroConsecutivosDetalhado(serieLucro);
  const anos = seq.valor;
  if (seq.lacuna !== null) flags.push(`lucro_serie_com_lacuna_${seq.lacuna}`);
  // último FY: só o atribuível do escopo escolhido (o individual entra apenas na sequência)
  const fyUltimo = fys[fys.length - 1];
  const ultimoFy: Valor<number> = !fyUltimo
    ? ausente('sem_dado_fonte', 'sem_fy')
    : lucroParaSequencia({ ...fyUltimo, lucroAtribuivelIndividual: null });
  let fund = e.fundAtual;
  if (!fund && fys.length > 0) {
    fund = fys[fys.length - 1];
    flags.push('ttm_ausente_usou_fy');
  }
  const cont =
    [...e.contagens]
      .filter((c) => c.total !== null)
      .sort((a, b) => b.data.localeCompare(a.data))[0] ?? null;
  const fator = fatorEquivalencia(e.ticker);
  if (fator === null) flags.push('unit_sem_composicao');
  const dpa12m = comCobertura(
    rendimento12m(e.proventos, e.dataRef, 'acao', e.eventos, p),
    e.proventos,
    e.cobertura,
  );
  const vm = valorMercadoEmpresa(e.tickersEmpresa, e.resumosEmpresa, cont);
  const vazio: FundamentosPeriodo['naoSeAplica'] = [];
  const m = multiplosAtuais(
    {
      classe: 'acao',
      preco: e.resumo.closeRaw,
      acoesTotais: fator === null ? null : (cont?.total ?? null),
      fatorEquivalencia: fator ?? 1,
      valorMercadoEmpresa: vm,
      fund: fund ?? {
        receita: null,
        lucroLiquido: null,
        lucroAtribuivel: null,
        ebit: null,
        depreciacaoAmortizacao: null,
        ativoTotal: null,
        ativoCirculante: null,
        passivoCirculante: null,
        caixa: null,
        aplicacoesFinanceiras: null,
        dividaBrutaCp: null,
        dividaBrutaLp: null,
        pl: null,
        plControladora: null,
        fco: null,
        capex: null,
        naoSeAplica: vazio,
        flags: [],
      },
      dpa: dpa12m,
      ehFinanceira: e.emissor?.ehFinanceira ?? false,
      historicoPl: historicoPlValor(e.historicoPl),
    },
    p,
  );
  const lpa = m.lpa ?? ausente('sem_dado_fonte');
  // payout do TTM = DPA 12m ÷ LPA TTM (LPA ≤ 0 ⇒ n/a, regra 4)
  let payoutPct: Valor<number>;
  if (lpa.estado !== 'ok') payoutPct = lpa;
  else if (dpa12m.estado !== 'ok') payoutPct = dpa12m;
  else if (!(lpa.valor > 0)) payoutPct = naoSeAplica('base_nao_positiva');
  else payoutPct = ok((dpa12m.valor / lpa.valor) * 100);
  m.payoutPct = payoutPct;
  return {
    m,
    anos,
    anosLacuna: seq.lacuna,
    lucroUltimoFy: ultimoFy,
    lpaTtm: lpa,
    vpa: m.vpa ?? ausente('sem_dado_fonte'),
    dpa12m,
    payoutPct,
    plControladora: deNumero(fund?.plControladora ?? fund?.pl ?? null),
    flags: [...flags, ...m.flags],
  };
}

export interface ScoreCalculado {
  regua: Regua;
  indice: ResultadoIndiceCalc;
  semaforo: ResultadoSemaforo;
  fiiTipo: string | null;
  motivosExtras: string[];
}

/** Função pura: Índice + semáforo de uma empresa a partir do ticker de referência. */
export function scoreAcao(
  c: CalculoAtualAcao,
  ehFinanceira: boolean,
  p: ScoringParams,
): ScoreCalculado {
  const regua: Regua = ehFinanceira ? 'acao_financeira' : 'acao';
  const m = c.m;
  const comps = componentesIndiceAcao(
    {
      anosLucroConsecutivos: c.anos,
      lucroUltimoFy: c.lucroUltimoFy,
      ehFinanceira,
      dividaLiquida: m.dividaLiquida ?? ausente('sem_dado_fonte'),
      ebitda: m.ebitda ?? ausente('sem_dado_fonte'),
      roePct: m.roePct ?? ausente('sem_dado_fonte'),
      plControladora: c.plControladora,
      dy12mPct: m.dyPct ?? ausente('sem_dado_fonte'),
      plVsMedia10aPct: m.plVsMedia10aPct ?? ausente('historico_curto'),
    },
    p,
  );
  const indice = calcularIndiceComParams(comps, regua, p);
  if (c.anosLacuna != null) {
    indice.incompleto = true;
    indice.motivosIncompleto = [
      ...indice.motivosIncompleto,
      `lucro:serie_com_lacuna_${c.anosLacuna}`,
    ];
  }
  const plNaoPositivo =
    (m.pl?.estado === 'nao_se_aplica' && m.pl.motivo === 'base_nao_positiva') ||
    (c.lucroUltimoFy.estado === 'ok' && c.lucroUltimoFy.valor <= 0);
  const sem = semaforo(
    {
      metricas: {
        anosLucroConsecutivos: c.anos,
        divLiqEbitda: m.divLiqEbitda ?? ausente('sem_dado_fonte'),
        roePct: m.roePct ?? ausente('sem_dado_fonte'),
        plVsMedia10aPct: m.plVsMedia10aPct ?? ausente('historico_curto'),
        dy12mPct: m.dyPct ?? ausente('sem_dado_fonte'),
      },
      ehFinanceira,
      dividaLiquida: m.dividaLiquida,
      ebitda: m.ebitda,
      plControladora: c.plControladora,
      plNaoPositivo,
    },
    regua,
    p,
  );
  return { regua, indice, semaforo: sem, fiiTipo: null, motivosExtras: [] };
}

export interface EntradaAtualFii {
  resumo: ResumoCotacao;
  mesAtual: FiiMesEnxuto | null;
  trimestre: FiiTrimestre | null;
  proventos: ProventoAuditadoCompleto[];
  eventos: EntradaAtualAcao['eventos'];
  cobertura: CoberturaProventos | undefined;
  dataRef: string;
}

export interface CalculoAtualFii {
  m: MultiplosCalculados;
  rend12m: Valor<number>;
  meses: Valor<number>;
  flags: string[];
}

export function calcularAtualFii(e: EntradaAtualFii, p: ScoringParams): CalculoAtualFii {
  const rend12m = comCobertura(
    rendimento12m(e.proventos, e.dataRef, 'fii', e.eventos, p),
    e.proventos,
    e.cobertura,
  );
  const det = mesesComRendimentoDetalhado(e.proventos, e.dataRef, p);
  const meses: Valor<number> =
    e.proventos.length > 0 || e.cobertura === 'EMPTY' || e.cobertura === 'OK'
      ? ok(det.meses)
      : ausente(e.cobertura === 'FETCH_FAIL' ? 'fonte_falhou' : 'sem_dado_fonte');
  const m = multiplosAtuais(
    {
      classe: 'fii',
      preco: e.resumo.closeRaw,
      vpCota: e.mesAtual?.vpCota ?? null,
      rendCota: rend12m,
      obrigacoesPlPct: e.mesAtual?.obrigacoesPlPct ?? null,
      vacanciaFisicaCvmPct: e.trimestre?.vacanciaFisicaCvmPct ?? null,
      nImoveisCvm: e.trimestre?.nImoveisRenda ?? null,
      pl: e.mesAtual?.pl ?? null,
    },
    p,
  );
  const flags = [...m.flags];
  if (det.mesEstimado) flags.push('mes_estimado');
  if (!e.mesAtual) flags.push('sem_informe_mensal');
  return { m, rend12m, meses, flags };
}

/** Régua do FII: reguaVigente da B; PL ≤ 0 ⇒ fora (regra 22); sem régua ⇒ tijolo + incompleto. */
export function reguaDoFii(
  mes: FiiMesEnxuto | null,
  p: ScoringParams,
): { regua: Regua; motivoFora: MotivoNaoSeAplica | null; motivosExtras: string[] } {
  if (mes?.pl !== null && mes?.pl !== undefined && mes.pl <= 0) {
    return { regua: 'fora_do_indice', motivoFora: 'base_nao_positiva', motivosExtras: [] };
  }
  const tipo = mes?.tipoVigente ?? null;
  if (tipo === 'fof' || mes?.reguaVigente === 'fora_do_indice') {
    return { regua: 'fora_do_indice', motivoFora: 'fof', motivosExtras: [] };
  }
  const extras: string[] = [];
  if (tipo === 'indefinido' && p.fii.indefinido.marcarIncompleto) extras.push('tipo:indefinido');
  if (mes?.reguaVigente === 'fii_tijolo' || mes?.reguaVigente === 'fii_papel') {
    return { regua: mes.reguaVigente, motivoFora: null, motivosExtras: extras };
  }
  return {
    regua: p.fii.indefinido.regua,
    motivoFora: null,
    motivosExtras: [...extras, 'regua:sem_informe'],
  };
}

export function scoreFii(c: CalculoAtualFii, e: EntradaAtualFii, p: ScoringParams): ScoreCalculado {
  const { regua, motivoFora, motivosExtras } = reguaDoFii(e.mesAtual, p);
  const nCri = deNumero(e.trimestre?.nCri ?? null);
  const maiorCri = deNumero(e.trimestre?.maiorCriPct ?? null);
  const comps = componentesIndiceFii(
    {
      mesesComRendimento: c.meses,
      obrigacoesPlPct: c.m.obrigacoesPlPct ?? ausente('sem_dado_fonte'),
      vacanciaFisicaCvmPct: c.m.vacanciaFisicaCvmPct ?? ausente('sem_dado_fonte'),
      dy12mPct: c.m.dyPct ?? ausente('sem_dado_fonte'),
      pvp: c.m.pvp ?? ausente('sem_dado_fonte'),
      maiorCriPct: maiorCri,
      nCri,
    },
    regua,
    p,
    motivoFora ?? 'fof',
  );
  const indice = calcularIndiceComParams(comps, regua, p, motivoFora ?? 'fof');
  if (motivosExtras.length > 0 && regua !== 'fora_do_indice') {
    indice.incompleto = true;
    indice.motivosIncompleto = [...indice.motivosIncompleto, ...motivosExtras];
  }
  const sem = semaforo(
    {
      metricas: {
        dy12mPct: c.m.dyPct ?? ausente('sem_dado_fonte'),
        vacanciaFisicaCvmPct: c.m.vacanciaFisicaCvmPct ?? ausente('sem_dado_fonte'),
        nImoveisCvm: c.m.nImoveisCvm ?? ausente('sem_dado_fonte'),
        obrigacoesPlPct: c.m.obrigacoesPlPct ?? ausente('sem_dado_fonte'),
        pvp: c.m.pvp ?? ausente('sem_dado_fonte'),
        maiorCriPct: maiorCri,
        nCri,
      },
    },
    regua,
    p,
  );
  return { regua, indice, semaforo: sem, fiiTipo: e.mesAtual?.tipoVigente ?? null, motivosExtras };
}

function linhaScore(
  base: {
    symbol: string;
    cnpj: string;
    classe: 'acao' | 'fii';
    dataRef: string;
    tickerReferencia: string | null;
  },
  s: ScoreCalculado,
  meta: { paramsVersion: number; agora: Date },
): Prisma.AssetScoreCreateManyInput {
  const r = s.indice;
  return {
    symbol: base.symbol,
    cnpj: base.cnpj,
    dataRef: deData(base.dataRef),
    classe: base.classe,
    regua: s.regua,
    fiiTipo: s.fiiTipo,
    tickerReferencia: base.tickerReferencia,
    indiceMf: r.indice.estado === 'ok' ? r.indice.valor : null,
    cLucro: notaComponente(r, 'lucro'),
    cDivida: notaComponente(r, 'divida'),
    cRent: notaComponente(r, 'rent'),
    cDiv: notaComponente(r, 'div'),
    cPreco: notaComponente(r, 'preco'),
    componentes: componentesJson(r.componentes),
    pesosEfetivos: r.pesosEfetivos as Prisma.InputJsonValue,
    checks: s.semaforo.checks as unknown as Prisma.InputJsonValue,
    criteriosAplicaveis: s.semaforo.aplicaveis,
    criteriosAtendidos: s.semaforo.atendidos,
    incompleto: r.incompleto,
    motivosIncompleto: r.motivosIncompleto,
    paramsVersion: meta.paramsVersion,
    computedAt: meta.agora,
  };
}

function linhaAtual(
  base: { symbol: string; cnpj: string; classe: 'acao' | 'fii'; resumo: ResumoCotacao },
  m: MultiplosCalculados & Partial<HistoricoPl>,
  extras: {
    ttmDtFim?: string | null;
    lpaTtm?: Valor<number>;
    vpa?: Valor<number>;
    dpa12m?: Valor<number>;
    rend12m?: Valor<number>;
    anos?: Valor<number>;
    meses?: Valor<number>;
    flags: string[];
  },
  meta: { paramsVersion: number; agora: Date },
): Prisma.AssetMultiplesCurrentCreateManyInput {
  const { colunas, naoSeAplica: na } = achatarValores({
    lpaTtm: extras.lpaTtm,
    vpa: extras.vpa,
    dpa12m: extras.dpa12m,
    rend12m: extras.rend12m,
    vpCota: m.vpCota,
    pl: m.pl,
    pvp: m.pvp,
    pReceita: m.pReceita,
    evEbitda: m.evEbitda,
    pFco: m.pFco,
    pFcl: m.pFcl,
    dy12mPct: m.dyPct,
    payoutPct: m.payoutPct,
    margemLiquidaPct: m.margemLiquidaPct,
    roePct: m.roePct,
    roaPct: m.roaPct,
    roicPct: m.roicPct,
    divLiqEbitda: m.divLiqEbitda,
    divLiqPl: m.divLiqPl,
    liquidezCorrente: m.liquidezCorrente,
    obrigacoesPlPct: m.obrigacoesPlPct,
    plMedia10a: m.plMedia10a,
    plVsMedia10aPct: m.plVsMedia10aPct,
  });
  const inteiro = (v?: Valor<number>) => (v && v.estado === 'ok' ? Math.round(v.valor) : null);
  return {
    symbol: base.symbol,
    cnpj: base.cnpj,
    classe: base.classe,
    preco: base.resumo.closeRaw,
    precoData: deData(base.resumo.ultimoPregao),
    ttmDtFim: extras.ttmDtFim ? deData(extras.ttmDtFim) : null,
    ...colunas,
    anosLucroConsecutivos: inteiro(extras.anos),
    mesesComRendimento: inteiro(extras.meses),
    plPontosHistorico: m.plPontosHistorico ?? 0,
    naoSeAplica: na,
    flags: [...new Set(extras.flags)],
    paramsVersion: meta.paramsVersion,
    calculadoEm: meta.agora,
  };
}

export interface ResultadoScores {
  dataRef: string;
  multiplosAtuais: number;
  scores: number;
  gravadas: number;
  retencao: { apagadas: number; datas: string[] };
  acoes: {
    tickers: number;
    comPreco: number;
    comFy: number;
    comFyEPreco: number;
    comScore: number;
    scoreDeFyEPreco: number;
    incompletos: number;
  };
  fiis: {
    listados: number;
    naoConferidos: number;
    conferidosComPreco: number;
    fof: number;
    comInformeEPreco: number;
    comScore: number;
    incompletos: number;
  };
  pctIncompleto: number;
  coberturaAcoesPct: number | null;
  coberturaFiisPct: number | null;
  amostra: Array<Record<string, unknown>>;
}

const LOTE_FUND = 100;

export async function recalcularScores(
  ctx: JobContexto,
  dados: DadosBase,
  memoria: MemoriaCalculo,
  plAnualFresco: Map<
    string,
    Array<{ anoFiscal: number; pl: number | null; plNaoSeAplica: boolean }>
  >,
  opts: { gravar: boolean; retencao: boolean },
): Promise<ResultadoScores> {
  const p = ctx.params;
  const u = dados.universo;
  const meta = { paramsVersion: ctx.paramsVersion, agora: new Date() };
  const resumos = await resumoCotacoes(ctx.prisma);
  const resumoPor = new Map(resumos.map((r) => [r.symbol, r]));
  const dataRef = dataRefScores(resumos, ctx.hoje);

  // Fundamentos (FY completo para a sequência de lucro; TTM/YTD/3M recentes para o atual)
  const cnpjsAcoes = [...new Set(u.acoes.map((a) => a.cnpj))];
  const emissores = [...u.emissores.values()];
  const fys: FundamentosPeriodo[] = [];
  const recentes: FundamentosPeriodo[] = [];
  const desdeRecente = menosMeses(ctx.hoje, 24);
  for (let i = 0; i < cnpjsAcoes.length; i += LOTE_FUND) {
    const lote = cnpjsAcoes.slice(i, i + LOTE_FUND);
    const em = emissores.filter((e) => lote.includes(e.cnpj));
    fys.push(
      ...(await fundamentosVigentes(ctx.prisma, lote, {
        tipos: ['FY'],
        escopo: 'preferido',
        emissores: em,
      })),
    );
    recentes.push(
      ...(await fundamentosVigentes(ctx.prisma, lote, {
        tipos: ['TTM', 'YTD', 'FY'],
        desde: desdeRecente,
        escopo: 'preferido',
        emissores: em,
      })),
    );
  }
  ctx.contar('linhasLidas', fys.length + recentes.length);
  const fysPor = agrupar(fys, (f) => f.emissorId);
  const recentesPor = agrupar(recentes, (f) => f.emissorId);
  const fundAtualPor = new Map<string, FundamentosPeriodo | null>();
  for (const [cnpj, lista] of recentesPor) {
    const ttm =
      lista
        .filter((f) => f.tipoPeriodo === 'TTM')
        .sort((a, b) => b.dtFim.localeCompare(a.dtFim))[0] ?? null;
    const balanco = ttm
      ? (lista.find((f) => f.dtFim === ttm.dtFim && f.tipoPeriodo !== 'TTM') ?? null)
      : null;
    fundAtualPor.set(cnpj, mesclarTtm(ttm, balanco));
  }

  const simbolosAcao = u.acoes.map((a) => a.symbol);
  const plGravado = await lerPlAnualGravado(ctx.prisma, simbolosAcao);
  for (const [s, l] of plAnualFresco) plGravado.set(s, l);

  const atuais: Prisma.AssetMultiplesCurrentCreateManyInput[] = [];
  const scores: Prisma.AssetScoreCreateManyInput[] = [];
  const res: ResultadoScores['acoes'] = {
    tickers: u.acoes.length,
    comPreco: 0,
    comFy: 0,
    comFyEPreco: 0,
    comScore: 0,
    scoreDeFyEPreco: 0,
    incompletos: 0,
  };

  // Ações, por empresa
  for (const [cnpj, tickers] of agrupar(u.acoes, (t) => t.cnpj)) {
    const comPreco = tickers.filter((t) => resumoPor.has(t.symbol));
    const temFy = (fysPor.get(cnpj) ?? []).length > 0;
    res.comPreco += comPreco.length;
    if (temFy) res.comFy += tickers.length;
    if (temFy) res.comFyEPreco += comPreco.length;
    if (comPreco.length === 0) continue;
    const precosEmpresa = new Map(
      comPreco.map((t) => [t.symbol, resumoPor.get(t.symbol)!.closeRaw]),
    );
    const emissor = u.emissores.get(cnpj);
    const calculos = new Map<string, CalculoAtualAcao>();
    for (const t of comPreco) {
      const c = calcularAtualAcao(
        {
          ticker: t,
          resumo: resumoPor.get(t.symbol)!,
          tickersEmpresa: tickers,
          resumosEmpresa: precosEmpresa,
          fundAtual: fundAtualPor.get(cnpj) ?? null,
          fys: fysPor.get(cnpj) ?? [],
          contagens: dados.contagensPorCnpj.get(cnpj) ?? [],
          emissor,
          proventos: memoria.proventos.get(t.symbol) ?? [],
          eventos: memoria.eventos.get(t.symbol) ?? [],
          cobertura: memoria.cobertura.get(t.symbol),
          historicoPl: plGravado.get(t.symbol) ?? [],
          dataRef,
        },
        p,
      );
      calculos.set(t.symbol, c);
      atuais.push(
        linhaAtual(
          { symbol: t.symbol, cnpj, classe: 'acao', resumo: resumoPor.get(t.symbol)! },
          c.m,
          {
            ttmDtFim: fundAtualPor.get(cnpj)?.dtFim ?? null,
            lpaTtm: c.lpaTtm,
            vpa: c.vpa,
            dpa12m: c.dpa12m,
            anos: c.anos,
            flags: c.flags,
          },
          meta,
        ),
      );
    }
    // decisão 13: índice por empresa no ticker de maior volume médio
    const ref = [...comPreco].sort(
      (a, b) =>
        resumoPor.get(b.symbol)!.volumeMedio21 - resumoPor.get(a.symbol)!.volumeMedio21 ||
        a.symbol.localeCompare(b.symbol),
    )[0];
    const s = scoreAcao(calculos.get(ref.symbol)!, emissor?.ehFinanceira ?? false, p);
    for (const t of comPreco) {
      scores.push(
        linhaScore(
          { symbol: t.symbol, cnpj, classe: 'acao', dataRef, tickerReferencia: ref.symbol },
          s,
          meta,
        ),
      );
      res.comScore++;
      if (temFy) res.scoreDeFyEPreco++;
      if (s.indice.incompleto) res.incompletos++;
    }
  }

  // FIIs
  const fiisRes: ResultadoScores['fiis'] = {
    listados: u.fiis.length,
    naoConferidos: 0,
    conferidosComPreco: 0,
    fof: 0,
    comInformeEPreco: 0,
    comScore: 0,
    incompletos: 0,
  };
  const cnpjsFii = [...new Set(u.fiis.map((f) => f.cnpj))];
  const trimestres = await fiiTrimestralUltimos(ctx.prisma, cnpjsFii, 1);
  const triPor = new Map(trimestres.map((t) => [t.cnpj, t]));
  for (const f of u.fiis) {
    const resumo = resumoPor.get(f.symbol);
    const meses = dados.fiiMensalPorCnpj.get(f.cnpj) ?? [];
    const mesAtual = [...meses].sort((a, b) => b.refMonth.localeCompare(a.refMonth))[0] ?? null;
    const entrada: EntradaAtualFii | null = resumo
      ? {
          resumo,
          mesAtual,
          trimestre: triPor.get(f.cnpj) ?? null,
          proventos: memoria.proventos.get(f.symbol) ?? [],
          eventos: memoria.eventos.get(f.symbol) ?? [],
          cobertura: memoria.cobertura.get(f.symbol),
          dataRef,
        }
      : null;
    let calc: CalculoAtualFii | null = null;
    if (entrada) {
      calc = calcularAtualFii(entrada, p);
      atuais.push(
        linhaAtual(
          { symbol: f.symbol, cnpj: f.cnpj, classe: 'fii', resumo: entrada.resumo },
          calc.m,
          { rend12m: calc.rend12m, meses: calc.meses, flags: calc.flags },
          meta,
        ),
      );
    }
    if (!f.conferido && p.fii.exigirTickerConferido) {
      fiisRes.naoConferidos++;
      continue;
    }
    if (!entrada || !calc) continue;
    fiisRes.conferidosComPreco++;
    const fora = mesAtual?.tipoVigente === 'fof' || mesAtual?.reguaVigente === 'fora_do_indice';
    if (fora) fiisRes.fof++;
    else if (mesAtual) fiisRes.comInformeEPreco++;
    const s = scoreFii(calc, entrada, p);
    scores.push(
      linhaScore(
        { symbol: f.symbol, cnpj: f.cnpj, classe: 'fii', dataRef, tickerReferencia: null },
        s,
        meta,
      ),
    );
    fiisRes.comScore++;
    if (s.indice.incompleto) fiisRes.incompletos++;
  }

  let gravadas = 0;
  let retencao = { apagadas: 0, datas: [] as string[] };
  if (opts.gravar && ctx.aplicar) {
    gravadas += await gravarMultiplosAtuais(ctx.prisma, atuais);
    gravadas += await gravarScores(ctx.prisma, dataRef, scores);
    if (opts.retencao) retencao = await aplicarRetencaoScores(ctx.prisma, ctx.hoje);
    ctx.contar('linhasGravadas', gravadas);
  }

  const totalScores = scores.length;
  const incompletos = res.incompletos + fiisRes.incompletos;
  const coberturaAcoesPct =
    res.comFyEPreco > 0 ? (res.scoreDeFyEPreco / res.comFyEPreco) * 100 : null;
  const fiisElegiveis = fiisRes.comInformeEPreco;
  const fiisComScoreElegiveis = scores.filter(
    (s) => s.classe === 'fii' && s.regua !== 'fora_do_indice' && s.indiceMf !== null,
  ).length;
  const coberturaFiisPct =
    fiisElegiveis > 0 ? Math.min(100, (fiisComScoreElegiveis / fiisElegiveis) * 100) : null;
  for (const [rotulo, pct] of [
    ['ações', coberturaAcoesPct],
    ['FIIs', coberturaFiisPct],
  ] as const) {
    if (pct !== null && pct < 95) {
      ctx.alertar({
        codigo: 'cobertura_scores',
        nivel: 'aviso',
        mensagem: `cobertura de scores de ${rotulo} ${pct.toFixed(1)}% (< 95%)`,
      });
    }
  }
  return {
    dataRef,
    multiplosAtuais: atuais.length,
    scores: totalScores,
    gravadas,
    retencao,
    acoes: res,
    fiis: fiisRes,
    pctIncompleto: totalScores > 0 ? (incompletos / totalScores) * 100 : 0,
    coberturaAcoesPct,
    coberturaFiisPct,
    amostra: scores.slice(0, 5).map((s) => ({
      symbol: s.symbol,
      regua: s.regua,
      indiceMf: s.indiceMf,
      componentes: [s.cLucro, s.cDivida, s.cRent, s.cDiv, s.cPreco],
      criterios: `${s.criteriosAtendidos} de ${s.criteriosAplicaveis}`,
      incompleto: s.incompleto,
      motivos: s.motivosIncompleto,
    })),
  };
}
