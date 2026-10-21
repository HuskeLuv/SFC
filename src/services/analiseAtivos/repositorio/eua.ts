/**
 * Repositório do cadastro SEC (sec_companies + sec_company_tickers) — Stocks e REITs.
 *
 * DONO: fatia A (grava: sec-cadastro/sec-fundamentos acrescentam aqui as escritas). Criado na fatia
 * 0 com as LEITURAS de assinatura FINAL que B (motor/Quadro EUA), C (página/busca) e D (Carteira)
 * importam sem editar este arquivo:
 *  - listarUniversoEua: empresas no universo de uma classe, com o ticker vigente na forma da Análise;
 *  - lerCadastroEua: cadastro por symbol da Análise (topo da página, busca, Comparador);
 *  - cikPorSymbolNorm: CIK pelo ticker normalizado (casa BRK-B, BRK.B e BRKB; Carteira).
 * Só banco: nenhum provedor externo no caminho da requisição.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { deData, paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import type { ClasseEua } from '@/types/analiseAtivosApi';
import {
  BOLSAS_EUA,
  SEGMENTOS_REIT,
  normalizarTickerEua,
  symbolAnaliseDaSec,
  symbolSecDaAnalise,
  type BolsaEua,
  type SegmentoReit,
} from '@/types/analiseAtivosEua';

/** Empresa EUA como B/C/D leem (ticker já na forma da Análise: BRK.B). */
export interface EmpresaEua {
  cik: string;
  /** forma da Análise (BRK.B) */
  symbol: string;
  /** forma da SEC (BRK-B) */
  symbolSec: string;
  symbolNorm: string;
  /** ticker principal do CIK (o primeiro do arquivo da SEC) */
  principal: boolean;
  nome: string;
  classe: ClasseEua;
  sic: number | null;
  ehFinanceira: boolean;
  bolsa: BolsaEua | null;
  segmento: SegmentoReit | null;
  exercicioFimMmdd: string | null;
  publicFloatUsd: number | null;
  publicFloatData: string | null;
  /** CIK que tem o histórico de 10-K (XOM) ou o próprio */
  cikFundamentos: string;
  noUniverso: boolean;
}

type Delegados = Pick<PrismaClient, 'secCompany' | 'secCompanyTicker'>;

const ehBolsa = (v: string | null): v is BolsaEua =>
  v !== null && (BOLSAS_EUA as readonly string[]).includes(v);
const ehSegmento = (v: string | null): v is SegmentoReit =>
  v !== null && (SEGMENTOS_REIT as readonly string[]).includes(v);

interface LinhaCompany {
  cik: string;
  nome: string;
  classe: string | null;
  sic: number | null;
  ehFinanceira: boolean;
  bolsa: string | null;
  segmento: string | null;
  exercicioFimMmdd: string | null;
  publicFloatUsd: { toNumber(): number } | null;
  publicFloatData: Date | null;
  cikHistorico: string | null;
  noUniverso: boolean;
}

function empresaDe(
  c: LinhaCompany,
  t: { symbol: string; symbolNorm: string; principal: boolean },
): EmpresaEua | null {
  if (c.classe !== 'stock' && c.classe !== 'reit') return null;
  return {
    cik: c.cik,
    symbol: symbolAnaliseDaSec(t.symbol),
    symbolSec: t.symbol,
    symbolNorm: t.symbolNorm,
    principal: t.principal,
    nome: c.nome,
    classe: c.classe,
    sic: c.sic,
    ehFinanceira: c.ehFinanceira,
    bolsa: ehBolsa(c.bolsa) ? c.bolsa : null,
    segmento: ehSegmento(c.segmento) ? c.segmento : null,
    exercicioFimMmdd: c.exercicioFimMmdd,
    publicFloatUsd: c.publicFloatUsd ? c.publicFloatUsd.toNumber() : null,
    publicFloatData: c.publicFloatData ? c.publicFloatData.toISOString().slice(0, 10) : null,
    cikFundamentos: c.cikHistorico ?? c.cik,
    noUniverso: c.noUniverso,
  };
}

const SELECT_COMPANY = {
  cik: true,
  nome: true,
  classe: true,
  sic: true,
  ehFinanceira: true,
  bolsa: true,
  segmento: true,
  exercicioFimMmdd: true,
  publicFloatUsd: true,
  publicFloatData: true,
  cikHistorico: true,
  noUniverso: true,
} as const;

/**
 * Empresas NO UNIVERSO das classes pedidas, uma entrada por ticker VIGENTE (validTo null) — todo
 * ticker listado de um CIK vira uma linha (GOOGL/GOOG, BRK-A/BRK-B), como PETR3/PETR4.
 */
export async function listarUniversoEua(
  prisma: Delegados,
  classes: readonly ClasseEua[],
): Promise<EmpresaEua[]> {
  if (classes.length === 0) return [];
  const empresas = await prisma.secCompany.findMany({
    where: { noUniverso: true, classe: { in: [...classes] } },
    select: SELECT_COMPANY,
    orderBy: { cik: 'asc' },
  });
  if (empresas.length === 0) return [];
  const tickers = await prisma.secCompanyTicker.findMany({
    where: { cik: { in: empresas.map((e) => e.cik) }, validTo: null },
    select: { cik: true, symbol: true, symbolNorm: true, principal: true },
    orderBy: [{ cik: 'asc' }, { symbol: 'asc' }],
  });
  const porCik = new Map(empresas.map((e) => [e.cik, e]));
  const out: EmpresaEua[] = [];
  for (const t of tickers) {
    const c = porCik.get(t.cik);
    const e = c ? empresaDe(c, t) : null;
    if (e) out.push(e);
  }
  return out;
}

/**
 * Cadastro por symbol da ANÁLISE (BRK.B; também aceita BRK-B), dentro ou fora do universo — a
 * página do ativo decide o 404 pelo noUniverso. Ticker sem cadastro fica fora do mapa.
 */
export async function lerCadastroEua(
  prisma: Delegados,
  symbols: readonly string[],
): Promise<Map<string, EmpresaEua>> {
  const out = new Map<string, EmpresaEua>();
  if (symbols.length === 0) return out;
  const daSec = [...new Set(symbols.map(symbolSecDaAnalise))];
  const tickers = await prisma.secCompanyTicker.findMany({
    where: { symbol: { in: daSec }, validTo: null },
    select: { cik: true, symbol: true, symbolNorm: true, principal: true },
  });
  if (tickers.length === 0) return out;
  const empresas = await prisma.secCompany.findMany({
    where: { cik: { in: [...new Set(tickers.map((t) => t.cik))] } },
    select: SELECT_COMPANY,
  });
  const porCik = new Map(empresas.map((e) => [e.cik, e]));
  for (const t of tickers) {
    const c = porCik.get(t.cik);
    const e = c ? empresaDe(c, t) : null;
    if (e) out.set(e.symbol, e);
  }
  return out;
}

/** CIK pelo ticker normalizado (BRKB ↔ BRK-B ↔ BRK.B), só tickers vigentes; null se não há. */
export async function cikPorSymbolNorm(
  prisma: Pick<PrismaClient, 'secCompanyTicker'>,
  ticker: string,
): Promise<string | null> {
  const t = await prisma.secCompanyTicker.findFirst({
    where: { symbolNorm: normalizarTickerEua(ticker), validTo: null },
    select: { cik: true },
    orderBy: { principal: 'desc' },
  });
  return t?.cik ?? null;
}

// ===========================================================================
// ESCRITAS (fatia A: sec-cadastro, sec-fundamentos, cotacoes-eua)
// ===========================================================================

/** Estado gravado de um CIK (incremental do sec-cadastro: submissions só quando muda). */
export interface CadastroGravadoEua {
  cik: string;
  nome: string;
  sic: number | null;
  sicDescricao: string | null;
  exercicioFimMmdd: string | null;
  noUniverso: boolean;
  ultimo10k: string | null;
  ultimo10kEm: string | null;
  publicFloatUsd: number | null;
}

export async function lerCadastrosGravadosEua(
  prisma: Pick<PrismaClient, 'secCompany'>,
): Promise<Map<string, CadastroGravadoEua>> {
  const linhas = await prisma.secCompany.findMany({
    select: {
      cik: true,
      nome: true,
      sic: true,
      sicDescricao: true,
      exercicioFimMmdd: true,
      noUniverso: true,
      ultimo10k: true,
      ultimo10kEm: true,
      publicFloatUsd: true,
    },
  });
  return new Map(
    linhas.map((l) => [
      l.cik,
      {
        ...l,
        ultimo10kEm: paraData(l.ultimo10kEm),
        publicFloatUsd: paraNumero(l.publicFloatUsd),
      },
    ]),
  );
}

export interface EmpresaSecGravavel {
  cik: string;
  nome: string;
  sic: number | null;
  sicDescricao: string | null;
  exercicioFimMmdd: string | null;
  bolsa: BolsaEua | null;
  publicFloatUsd: number | null;
  publicFloatData: string | null;
  floatSanidade: string | null;
  classe: ClasseEua;
  ehReit: boolean;
  reitTipo: string | null;
  segmento: SegmentoReit | null;
  ehFinanceira: boolean;
  noUniverso: boolean;
  foraMotivo: string | null;
  cikHistorico: string | null;
  origem: 'regra' | 'override';
  ultimo10k: string | null;
  ultimo10kEm: string | null;
}

export async function gravarEmpresaSec(
  prisma: Pick<PrismaClient, 'secCompany'>,
  e: EmpresaSecGravavel,
  agora: Date = new Date(),
): Promise<void> {
  const dados = {
    nome: e.nome,
    sic: e.sic,
    sicDescricao: e.sicDescricao,
    exercicioFimMmdd: e.exercicioFimMmdd,
    bolsa: e.bolsa,
    publicFloatUsd: dec(e.publicFloatUsd, 2),
    publicFloatData: e.publicFloatData ? deData(e.publicFloatData) : null,
    floatSanidade: e.floatSanidade,
    classe: e.classe,
    ehReit: e.ehReit,
    reitTipo: e.reitTipo,
    segmento: e.segmento,
    ehFinanceira: e.ehFinanceira,
    noUniverso: e.noUniverso,
    foraMotivo: e.foraMotivo,
    cikHistorico: e.cikHistorico,
    origem: e.origem,
    ultimo10k: e.ultimo10k,
    ultimo10kEm: e.ultimo10kEm ? deData(e.ultimo10kEm) : null,
    fetchedAt: agora,
  };
  await prisma.secCompany.upsert({
    where: { cik: e.cik },
    create: { cik: e.cik, ...dados },
    update: dados,
  });
}

/** CIKs que saíram dos candidatos (delistados, float muito abaixo): fora do universo. */
export async function marcarForaDoUniversoEua(
  prisma: Pick<PrismaClient, 'secCompany'>,
  ciks: readonly string[],
  foraMotivo: string,
  agora: Date = new Date(),
): Promise<number> {
  if (ciks.length === 0) return 0;
  const r = await prisma.secCompany.updateMany({
    where: { cik: { in: [...ciks] }, noUniverso: true },
    data: { noUniverso: false, foraMotivo, fetchedAt: agora },
  });
  return r.count;
}

/**
 * Tickers vigentes de um CIK = os do arquivo da SEC (na ordem; o primeiro é o principal). Ticker
 * que sumiu ganha validTo = hoje; ticker novo nasce com validFrom = hoje; ticker que mudou de CIK
 * fecha no antigo e abre no novo. O override nunca passa por aqui. Devolve quantas linhas mudaram.
 */
export async function sincronizarTickersSec(
  prisma: Pick<PrismaClient, 'secCompanyTicker'>,
  cik: string,
  symbolsSec: readonly string[],
  hoje: string,
  agora: Date = new Date(),
): Promise<number> {
  const dia = deData(hoje);
  const desejados = [...new Set(symbolsSec.map((s) => s.trim().toUpperCase()))];
  const vigentes = await prisma.secCompanyTicker.findMany({
    where: { OR: [{ cik }, { symbol: { in: desejados } }], validTo: null },
    select: { id: true, symbol: true, cik: true, principal: true, validFrom: true },
  });
  let mudou = 0;
  for (const v of vigentes) {
    if (v.cik === cik && desejados.includes(v.symbol)) continue;
    // nasceu hoje e já mudou (rodada repetida no mesmo dia): apaga em vez de fechar
    if (paraData(v.validFrom) === hoje) {
      await prisma.secCompanyTicker.delete({ where: { id: v.id } });
    } else {
      await prisma.secCompanyTicker.update({ where: { id: v.id }, data: { validTo: dia } });
    }
    mudou++;
  }
  for (const [i, symbol] of desejados.entries()) {
    const principal = i === 0;
    const atual = vigentes.find((v) => v.cik === cik && v.symbol === symbol);
    if (atual) {
      if (atual.principal !== principal) {
        await prisma.secCompanyTicker.update({
          where: { id: atual.id },
          data: { principal, fetchedAt: agora },
        });
        mudou++;
      }
      continue;
    }
    await prisma.secCompanyTicker.upsert({
      where: { symbol_validFrom: { symbol, validFrom: dia } },
      create: {
        symbol,
        symbolNorm: normalizarTickerEua(symbol),
        cik,
        principal,
        validFrom: dia,
        fetchedAt: agora,
      },
      update: { cik, principal, validTo: null, fetchedAt: agora },
    });
    mudou++;
  }
  return mudou;
}

/** CIK de fundamentos (cikHistorico ?? cik) das empresas no universo, sem repetição. */
export async function listarCiksFundamentosEua(
  prisma: Pick<PrismaClient, 'secCompany'>,
): Promise<{ cik: string; cikFundamentos: string; nome: string }[]> {
  const linhas = await prisma.secCompany.findMany({
    where: { noUniverso: true },
    select: { cik: true, cikHistorico: true, nome: true },
    orderBy: { cik: 'asc' },
  });
  const vistos = new Set<string>();
  const out: { cik: string; cikFundamentos: string; nome: string }[] = [];
  for (const l of linhas) {
    const f = l.cikHistorico ?? l.cik;
    if (vistos.has(f)) continue;
    vistos.add(f);
    out.push({ cik: l.cik, cikFundamentos: f, nome: l.nome });
  }
  return out;
}

/** emissorIds 'CIK:…' que já têm alguma linha SEC (os demais entram no backfill do job). */
export async function emissoresComFundamentosSec(
  prisma: Pick<PrismaClient, 'assetFundamentalsPeriod'>,
): Promise<Set<string>> {
  const l = await prisma.assetFundamentalsPeriod.findMany({
    where: { source: 'SEC' },
    select: { emissorId: true },
    distinct: ['emissorId'],
  });
  return new Set(l.map((x) => x.emissorId));
}

/** Colunas SEC comparadas para decidir se um FY ganhou versão nova. */
export const COLUNAS_VALOR_SEC = [
  'receita',
  'ebit',
  'depreciacaoAmortizacao',
  'lucroLiquido',
  'lucroAtribuivel',
  'ativoTotal',
  'caixa',
  'aplicacoesFinanceiras',
  'dividaBrutaCp',
  'dividaBrutaLp',
  'pl',
  'plControladora',
  'fco',
  'capex',
  'dividendosJcpPagos',
  'recompras',
  'acoesMediaDiluida',
  'lpaOn',
  'dpa',
] as const;
export type ColunaValorSec = (typeof COLUNAS_VALOR_SEC)[number];

/**
 * F3 fundamentei-regras (A2.d): remuneração em ações (SBC). Entra na comparação de versão SÓ com
 * ANALISE_ATIVOS_SEC_SBC (`incluirSbc`): desligada, COLUNAS_VALOR_SEC, a impressão digital e a
 * leitura das versões gravadas são as de hoje e o cron sec-fundamentos não cria versão nova.
 */
export const COLUNA_SBC_SEC = 'remuneracaoAcoes' as const;

/** Opção da comparação de versão (o job passa analiseAtivosSecSbc()). */
export interface OpcoesVersaoSec {
  incluirSbc?: boolean;
}

/** Colunas comparadas: as de hoje + a SBC com `incluirSbc`. */
export function colunasValorSec(
  opts: OpcoesVersaoSec = {},
): ReadonlyArray<ColunaValorSec | typeof COLUNA_SBC_SEC> {
  return opts.incluirSbc ? [...COLUNAS_VALOR_SEC, COLUNA_SBC_SEC] : COLUNAS_VALOR_SEC;
}

/** FY SEC já normalizado para gravar (números na escala das colunas). */
export type PeriodoSecGravavel = Record<ColunaValorSec, number | null> & {
  emissorId: string;
  anoFiscal: number;
  dtIni: string;
  dtFim: string;
  accession: string;
  dtEntrega: string;
  dtEntregaOriginal: string;
  sourceUrl: string;
  dpaOrigem: string | null;
  sourceConcept: Record<string, string>;
  flags: string[];
  /** F3: só com a extração `incluirSbc` (ausente = linha de hoje, coluna nula) */
  remuneracaoAcoes?: number | null;
};

/** Última versão gravada de um FY SEC (por dtFim). */
export interface VersaoSecGravada {
  versao: number;
  impressao: string;
}

type CamposImpressao = Record<ColunaValorSec, number | null> & {
  anoFiscal: number;
  dtIni: string;
  dpaOrigem: string | null;
  sourceConcept: Record<string, string>;
  flags: readonly string[];
  remuneracaoAcoes?: number | null;
};

/**
 * Impressão digital de um FY: valores (na escala das colunas), datas, ano, flags, origem do DPA
 * e conceitos. Igual ⇒ não grava versão nova (versao +1 só quando muda).
 *
 * F3: sem `incluirSbc` a string é a de hoje — a SBC fica fora dos valores e o conceito
 * 'remuneracaoAcoes' fica fora dos conceitos (inclusive o de uma versão gravada com a chave ligada:
 * desligar a chave depois não gera versão nova). Com `incluirSbc`, a SBC entra no fim dos valores.
 */
export function impressaoPeriodoSec(p: CamposImpressao, opts: OpcoesVersaoSec = {}): string {
  const valores = colunasValorSec(opts).map((c) => {
    const v = c === COLUNA_SBC_SEC ? (p.remuneracaoAcoes ?? null) : p[c];
    return v === null ? '' : String(v);
  });
  const conceitos = Object.keys(p.sourceConcept)
    .filter((k) => opts.incluirSbc || k !== COLUNA_SBC_SEC)
    .sort()
    .map((k) => `${k}=${p.sourceConcept[k]}`);
  return [
    p.anoFiscal,
    p.dtIni,
    valores.join(','),
    p.dpaOrigem ?? '',
    [...p.flags].sort().join(','),
    conceitos.join(';'),
  ].join('|');
}

const SELECT_VERSAO_SEC = {
  dtFim: true,
  versao: true,
  anoFiscal: true,
  dtIni: true,
  dpaOrigem: true,
  sourceConcept: true,
  flags: true,
  receita: true,
  ebit: true,
  depreciacaoAmortizacao: true,
  lucroLiquido: true,
  lucroAtribuivel: true,
  ativoTotal: true,
  caixa: true,
  aplicacoesFinanceiras: true,
  dividaBrutaCp: true,
  dividaBrutaLp: true,
  pl: true,
  plControladora: true,
  fco: true,
  capex: true,
  dividendosJcpPagos: true,
  recompras: true,
  acoesMediaDiluida: true,
  lpaOn: true,
  dpa: true,
} satisfies Prisma.AssetFundamentalsPeriodSelect;

/** F3: a mesma leitura + a SBC, para a impressão gravada bater com a recalculada (incluirSbc). */
const SELECT_VERSAO_SEC_SBC = {
  ...SELECT_VERSAO_SEC,
  remuneracaoAcoes: true,
} satisfies Prisma.AssetFundamentalsPeriodSelect;

export async function lerVersoesSec(
  prisma: Pick<PrismaClient, 'assetFundamentalsPeriod'>,
  emissorId: string,
  opts: OpcoesVersaoSec = {},
): Promise<Map<string, VersaoSecGravada>> {
  const linhas: Array<
    Prisma.AssetFundamentalsPeriodGetPayload<{ select: typeof SELECT_VERSAO_SEC }> & {
      remuneracaoAcoes?: Prisma.Decimal | null;
    }
  > = await prisma.assetFundamentalsPeriod.findMany({
    where: { emissorId, source: 'SEC', tipoPeriodo: 'FY', escopo: 'con' },
    select: opts.incluirSbc ? SELECT_VERSAO_SEC_SBC : SELECT_VERSAO_SEC,
    orderBy: [{ dtFim: 'asc' }, { versao: 'desc' }],
  });
  const out = new Map<string, VersaoSecGravada>();
  for (const l of linhas) {
    const dtFim = paraData(l.dtFim);
    if (out.has(dtFim)) continue;
    const valores = {} as Record<ColunaValorSec, number | null>;
    for (const c of COLUNAS_VALOR_SEC) valores[c] = paraNumero(l[c]);
    const sourceConcept =
      l.sourceConcept && typeof l.sourceConcept === 'object' && !Array.isArray(l.sourceConcept)
        ? (l.sourceConcept as Record<string, string>)
        : {};
    out.set(dtFim, {
      versao: l.versao,
      impressao: impressaoPeriodoSec(
        {
          ...valores,
          anoFiscal: l.anoFiscal,
          dtIni: paraData(l.dtIni),
          dpaOrigem: l.dpaOrigem,
          sourceConcept,
          flags: l.flags,
          ...(opts.incluirSbc ? { remuneracaoAcoes: paraNumero(l.remuneracaoAcoes) } : {}),
        },
        opts,
      ),
    });
  }
  return out;
}

function dec(v: number | null, casas: number): Prisma.Decimal | null {
  return v === null ? null : new Prisma.Decimal(v.toFixed(casas));
}

/** Linha de AssetFundamentalsPeriod (source 'SEC', FY, con, USGAAP, USD, UNIDADE). */
export function linhaFundamentoSec(
  p: PeriodoSecGravavel,
  versao: number,
  agora: Date,
): Prisma.AssetFundamentalsPeriodCreateManyInput {
  return {
    emissorId: p.emissorId,
    source: 'SEC',
    docTipo: '10-K',
    accession: p.accession,
    sourceConcept: p.sourceConcept,
    sourceUrl: p.sourceUrl,
    tipoPeriodo: 'FY',
    escopo: 'con',
    padraoContabil: 'USGAAP',
    dtIni: deData(p.dtIni),
    dtFim: deData(p.dtFim),
    anoFiscal: p.anoFiscal,
    versao,
    dtEntrega: deData(p.dtEntrega),
    dtEntregaOriginal: deData(p.dtEntregaOriginal),
    moeda: 'USD',
    escalaOriginal: 'UNIDADE',
    receita: dec(p.receita, 2),
    ebit: dec(p.ebit, 2),
    depreciacaoAmortizacao: dec(p.depreciacaoAmortizacao, 2),
    lucroLiquido: dec(p.lucroLiquido, 2),
    lucroAtribuivel: dec(p.lucroAtribuivel, 2),
    ativoTotal: dec(p.ativoTotal, 2),
    caixa: dec(p.caixa, 2),
    aplicacoesFinanceiras: dec(p.aplicacoesFinanceiras, 2),
    dividaBrutaCp: dec(p.dividaBrutaCp, 2),
    dividaBrutaLp: dec(p.dividaBrutaLp, 2),
    pl: dec(p.pl, 2),
    plControladora: dec(p.plControladora, 2),
    fco: dec(p.fco, 2),
    capex: dec(p.capex, 2),
    dividendosJcpPagos: dec(p.dividendosJcpPagos, 2),
    recompras: dec(p.recompras, 2),
    acoesMediaDiluida: dec(p.acoesMediaDiluida, 0),
    lpaOn: p.lpaOn,
    dpa: p.dpa,
    dpaOrigem: p.dpaOrigem,
    naoSeAplica: [],
    flags: p.flags,
    fetchedAt: agora,
    // F3: só com a extração `incluirSbc`; sem ela a coluna fica fora do insert (nula, como hoje)
    ...('remuneracaoAcoes' in p ? { remuneracaoAcoes: dec(p.remuneracaoAcoes ?? null, 2) } : {}),
  };
}

export async function gravarLinhasFundamentoSec(
  prisma: Pick<PrismaClient, 'assetFundamentalsPeriod'>,
  linhas: Prisma.AssetFundamentalsPeriodCreateManyInput[],
): Promise<number> {
  if (linhas.length === 0) return 0;
  const r = await prisma.assetFundamentalsPeriod.createMany({ data: linhas, skipDuplicates: true });
  return r.count;
}

// ---------------------------------------------------------------- cotação EUA (atrás da chave)

export interface CotacaoEuaGravavel {
  symbol: string;
  date: string;
  close: number;
  adjClose: number | null;
  volume: number | null;
  source: string;
}

export async function gravarCotacoesEua(
  prisma: Pick<PrismaClient, 'assetQuoteDailyUs'>,
  linhas: readonly CotacaoEuaGravavel[],
  agora: Date = new Date(),
): Promise<number> {
  let n = 0;
  for (const l of linhas) {
    const dados = {
      close: new Prisma.Decimal(l.close.toFixed(6)),
      adjClose: dec(l.adjClose, 6),
      volume: l.volume === null ? null : BigInt(Math.round(l.volume)),
      source: l.source,
      fetchedAt: agora,
    };
    await prisma.assetQuoteDailyUs.upsert({
      where: { symbol_date: { symbol: l.symbol, date: deData(l.date) } },
      create: { symbol: l.symbol, date: deData(l.date), ...dados },
      update: dados,
    });
    n++;
  }
  return n;
}
