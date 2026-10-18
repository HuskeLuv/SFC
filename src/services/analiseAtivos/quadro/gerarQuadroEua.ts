/**
 * Job 'quadro-eua' — materializa as linhas stock/reit de analise_quadro_linhas (fatia B da feature
 * EUA). Só banco. No cron roda dentro do 'eua-diario', depois do criterios-eua. O mapeamento das
 * colunas é o contrato "Quadro EUA" de src/types/analiseAtivosEua.ts (a fatia C lê exatamente isto):
 *  - um item por ticker VIGENTE das empresas no universo (listarUniversoEua; fora do universo = sem
 *    linha): symbol na forma da Análise (BRK.B), classe stock|reit, cnpj 'CIK:##########';
 *  - noQuadro = true; temScore = false; estadoIndice = 'sem_score' (não há indicador antigo EUA);
 *  - setor = rótulo PT da divisão SIC (setorDoSic); segmento = rótulo PT do segmento REIT curado
 *    (TEXTOS_EUA.segmentosReit) ou null; moeda 'USD'; bolsa NYSE | Nasdaq;
 *  - indicadores do último FY (multiplosEua): ROE, margem, Dív.líq/EBITDA, Dív.líq/PL, payout, DPA,
 *    FCO/ação, dividendos/FCO, anos seguidos com lucro e com dividendo, serie10a (lucro em US$ mi);
 *  - preço/variação/P/L/P/VP/DY = null SEM ANALISE_ATIVOS_EUA_PRECO_HABILITADO (com a chave, do último
 *    fechamento em AssetQuoteDailyUs);
 *  - criterios/perfilCriterios/paramsVersion = cópia compacta de criteria_eval das classes EUA
 *    (lerCompactosPorSimbolo com CLASSES_EUA);
 *  - flags = flags SEC do último FY (FLAGS_FUNDAMENTO_SEC: EBITDA por degrau, DPA calculado…).
 * Grava pelo gravador ISOLADO da fatia 0 (gravarLinhasQuadro com CLASSES_EUA): nunca apaga acao/fii e
 * recusa symbol já gravado com classe BR. Universo vazio = nada é apagado.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  analiseAtivosEuaHabilitado,
  analiseAtivosEuaPrecoHabilitado,
} from '@/lib/analiseAtivosConfig';
import { multiplosEua } from '@/services/analiseAtivos/calculo/multiplosEua';
import { gravarLinhasQuadro } from '@/services/analiseAtivos/quadro/gerarQuadro';
import type { LinhaQuadroGravar } from '@/services/analiseAtivos/quadro/montarLinhasQuadro';
import {
  lerBrutosSec,
  fysSecPorAno,
  type BrutoSec,
} from '@/services/analiseAtivos/regras/criterios/seriesStock';
import { paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import {
  lerCompactosPorSimbolo,
  type CompactoSimbolo,
} from '@/services/analiseAtivos/repositorio/criterios';
import { listarUniversoEua, type EmpresaEua } from '@/services/analiseAtivos/repositorio/eua';
import { setorDoSic, TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';
import type { AlertaJob, JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';
import { CLASSES_EUA } from '@/types/analiseAtivosApi';
import {
  emissorIdSec,
  FLAGS_FUNDAMENTO_SEC,
  MOEDA_LINHA_EUA,
  symbolSecDaAnalise,
} from '@/types/analiseAtivosEua';

/** CIKs por leitura dos FY (pico de memória baixo, como o criterios-eua). */
export const LOTE_QUADRO_EUA = 50;
/** Anos de FY lidos (serie10a + folga para o último FY fechado). */
const ANOS_LEITURA = 12;
/** Janela para achar o último fechamento EUA (só com a chave de preço). */
const JANELA_COTACAO_DIAS = 10;
const DIA_MS = 86_400_000;

export interface CotacaoEua {
  close: number;
  /** 'AAAA-MM-DD' */
  date: string;
  /** fechamento do pregão anterior (variação do dia) */
  anterior: number | null;
}

export interface EntradaQuadroEua {
  hoje: string;
  geradoEm: Date;
  empresas: EmpresaEua[];
  /** por CIK de fundamentos */
  brutos: Map<string, BrutoSec>;
  compactos: Map<string, CompactoSimbolo>;
  /** Asset.id por ticker (Asset em USD com o ticker exato) */
  assets: Map<string, string>;
  /** vazio sem a chave de preço */
  cotacoes: Map<string, CotacaoEua>;
  comPreco: boolean;
}

const flagsSec = new Set<string>(FLAGS_FUNDAMENTO_SEC);

/** Linhas do Quadro EUA (pura). */
export function montarLinhasQuadroEua(e: EntradaQuadroEua): {
  linhas: LinhaQuadroGravar[];
  alertas: AlertaJob[];
  porClasse: { stock: number; reit: number };
} {
  const alertas: AlertaJob[] = [];
  const dataRef = new Date(`${e.hoje}T00:00:00.000Z`);
  const porClasse = { stock: 0, reit: 0 };
  const semCriterios: string[] = [];
  const vistos = new Set<string>();
  const linhas: LinhaQuadroGravar[] = [];
  for (const emp of e.empresas) {
    if (vistos.has(emp.symbol)) continue;
    vistos.add(emp.symbol);
    const fys = e.brutos.get(emp.cikFundamentos)?.fys ?? [];
    const cot = e.comPreco ? (e.cotacoes.get(emp.symbol) ?? null) : null;
    const m = multiplosEua(fys, cot?.close ?? null);
    const ultimo = [...fysSecPorAno(fys).values()].pop();
    const crit = e.compactos.get(emp.symbol);
    if (!crit) semCriterios.push(emp.symbol);
    porClasse[emp.classe]++;
    linhas.push({
      symbol: emp.symbol,
      classe: emp.classe,
      cnpj: emissorIdSec(emp.cik),
      dataRef,
      noQuadro: true,
      foraDoQuadroMotivo: null,
      temScore: false,
      estadoIndice: 'sem_score',
      nome: emp.nome,
      nomeCurto: null,
      setor: setorDoSic(emp.sic),
      subsetor: null,
      segmento: emp.segmento ? TEXTOS_EUA.segmentosReit[emp.segmento] : null,
      segmentoListagem: null,
      fiiTipo: null,
      segmentoCvm: null,
      regua: null,
      tickerReferencia: null,
      preco: cot?.close ?? null,
      precoData: cot ? new Date(`${cot.date}T00:00:00.000Z`) : null,
      variacaoDiaPct:
        cot && cot.anterior !== null && cot.anterior > 0
          ? Math.round((cot.close / cot.anterior - 1) * 100 * 100) / 100
          : null,
      volumeMedio21: null,
      baixaLiquidez: false,
      valorMercado: null,
      patrimonio: null,
      indiceMf: null,
      criteriosAtendidos: null,
      criteriosAplicaveis: null,
      statusCriterios: [],
      motivosIncompleto: [],
      componentesZeroRegra: [],
      anosLucroConsecutivos: m.anosLucroConsecutivos,
      mesesComRendimento: null,
      anosDividendo: m.anosDividendo,
      roePct: m.roePct,
      pl: m.pl,
      pvp: m.pvp,
      dy12mPct: m.dy12mPct,
      margemLiquidaPct: m.margemLiquidaPct,
      divLiqEbitda: m.divLiqEbitda,
      divLiqPl: m.divLiqPl,
      payoutPct: m.payoutPct,
      vacanciaFisicaCvmPct: null,
      nImoveisCvm: null,
      nCri: null,
      obrigacoesPlPct: null,
      cotistas: null,
      naoSeAplica: [],
      serie10a: m.serie10a as unknown as Prisma.InputJsonValue,
      serieUlt12m: null,
      pares: [],
      assetId: e.assets.get(emp.symbol) ?? null,
      flags: (ultimo?.flags ?? []).filter((f) => flagsSec.has(f)),
      paramsVersion: crit?.paramsVersion ?? null,
      geradoEm: e.geradoEm,
      moeda: MOEDA_LINHA_EUA,
      bolsa: emp.bolsa,
      dpa: m.dpa,
      fcoPorAcao: m.fcoPorAcao,
      dividendosFcoPct: m.dividendosFcoPct,
      ...(crit
        ? {
            criterios: crit.criterios as unknown as Prisma.InputJsonValue,
            perfilCriterios: crit.perfil,
          }
        : {}),
    });
  }
  if (semCriterios.length > 0) {
    alertas.push({
      codigo: 'quadro_eua_sem_criterios',
      nivel: 'aviso',
      mensagem: `${semCriterios.length} linhas EUA sem avaliação dos critérios (criterios-eua não rodou para elas): ${semCriterios
        .slice(0, 20)
        .join(', ')}${semCriterios.length > 20 ? '…' : ''}`,
    });
  }
  return { linhas, alertas, porClasse };
}

/** Último fechamento (e o anterior) de cada ticker em AssetQuoteDailyUs nos últimos dias. */
async function lerCotacoesEua(
  prisma: Pick<PrismaClient, 'assetQuoteDailyUs'>,
  empresas: readonly EmpresaEua[],
  hoje: string,
): Promise<Map<string, CotacaoEua>> {
  const out = new Map<string, CotacaoEua>();
  if (empresas.length === 0) return out;
  const daSec = new Map<string, string>();
  for (const e of empresas) {
    daSec.set(e.symbol, e.symbol);
    daSec.set(symbolSecDaAnalise(e.symbol), e.symbol);
  }
  const desde = new Date(Date.parse(`${hoje}T00:00:00.000Z`) - JANELA_COTACAO_DIAS * DIA_MS);
  const linhas = await prisma.assetQuoteDailyUs.findMany({
    where: { symbol: { in: [...daSec.keys()] }, date: { gte: desde } },
    select: { symbol: true, date: true, close: true },
    orderBy: [{ symbol: 'asc' }, { date: 'desc' }],
  });
  const porSymbol = new Map<string, Array<{ date: string; close: number }>>();
  for (const l of linhas) {
    const s = daSec.get(l.symbol);
    const close = paraNumero(l.close);
    if (!s || close === null) continue;
    const lista = porSymbol.get(s) ?? [];
    lista.push({ date: paraData(l.date), close });
    porSymbol.set(s, lista);
  }
  for (const [s, lista] of porSymbol) {
    lista.sort((a, b) => b.date.localeCompare(a.date));
    out.set(s, { close: lista[0].close, date: lista[0].date, anterior: lista[1]?.close ?? null });
  }
  return out;
}

export async function carregarEntradaQuadroEua(
  prisma: PrismaClient,
  hoje: string,
  opts: { comPreco?: boolean; geradoEm?: Date } = {},
): Promise<EntradaQuadroEua> {
  // a de preço só vale com a EUA (mesma regra de acessoAnalise.flagsEua, sem a sessão)
  const comPreco =
    opts.comPreco ?? (analiseAtivosEuaPrecoHabilitado() && analiseAtivosEuaHabilitado());
  const empresas = await listarUniversoEua(prisma, CLASSES_EUA);
  const ciks = [...new Set(empresas.map((e) => e.cikFundamentos))];
  const desdeAno = Number(hoje.slice(0, 4)) - ANOS_LEITURA;
  const brutos = new Map<string, BrutoSec>();
  for (let i = 0; i < ciks.length; i += LOTE_QUADRO_EUA) {
    const lote = await lerBrutosSec(prisma, ciks.slice(i, i + LOTE_QUADRO_EUA), desdeAno);
    for (const [cik, b] of lote) brutos.set(cik, b);
  }
  const symbols = [...new Set(empresas.map((e) => e.symbol))];
  const [compactos, assets, cotacoes] = await Promise.all([
    lerCompactosPorSimbolo(prisma, { classes: CLASSES_EUA }),
    symbols.length
      ? prisma.asset.findMany({
          where: { symbol: { in: symbols }, currency: 'USD' },
          select: { id: true, symbol: true },
        })
      : Promise.resolve([]),
    comPreco ? lerCotacoesEua(prisma, empresas, hoje) : Promise.resolve(new Map()),
  ]);
  return {
    hoje,
    geradoEm: opts.geradoEm ?? new Date(),
    empresas,
    brutos,
    compactos,
    assets: new Map(assets.map((a) => [a.symbol, a.id])),
    cotacoes,
    comPreco,
  };
}

export interface DependenciasQuadroEua {
  carregar: (prisma: PrismaClient, hoje: string) => Promise<EntradaQuadroEua>;
  gravar: typeof gravarLinhasQuadro;
}

export const DEPENDENCIAS_QUADRO_EUA: DependenciasQuadroEua = {
  carregar: (prisma, hoje) => carregarEntradaQuadroEua(prisma, hoje),
  gravar: gravarLinhasQuadro,
};

export async function gerarQuadroEua(
  ctx: JobContexto,
  deps: DependenciasQuadroEua = DEPENDENCIAS_QUADRO_EUA,
): Promise<ResultadoJob> {
  const inicio = Date.now();
  const entrada = await deps.carregar(ctx.prisma, ctx.hoje);
  ctx.contar('linhasLidas', entrada.empresas.length);
  const r = montarLinhasQuadroEua(entrada);
  for (const a of r.alertas) ctx.alertar(a);
  if (r.linhas.length === 0) {
    ctx.alertar({
      codigo: 'quadro_eua_vazio',
      nivel: 'aviso',
      mensagem: 'nenhuma empresa EUA no universo (rode sec-cadastro): nada foi apagado',
    });
    return { detalhes: { linhas: 0, linhasGravadas: 0 } };
  }
  let gravadas = 0;
  if (ctx.aplicar) {
    gravadas = await deps.gravar(ctx.prisma, r.linhas, CLASSES_EUA);
    ctx.contar('linhasGravadas', gravadas);
  }
  return {
    detalhes: {
      dataRef: ctx.hoje,
      linhas: r.linhas.length,
      linhasGravadas: gravadas,
      porClasse: r.porClasse,
      comCriterios: r.linhas.filter((l) => l.criterios !== undefined).length,
      comPreco: entrada.comPreco,
      aplicar: ctx.aplicar,
      duracaoMs: Date.now() - inicio,
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  };
}
