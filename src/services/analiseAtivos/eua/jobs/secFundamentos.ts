/**
 * Job 'sec-fundamentos' (diário, dentro do 'eua-diario' das 11:25 UTC; pesado). Incremental:
 *
 * 1. índice diário form.AAAAMMDD.idx da EDGAR desde o cursor (dia seguinte ao último lido até
 *    ontem, máx. 30 dias; 404 = feriado/fim de semana): CIKs do universo com 10-K, 10-K/A ou 10-KT;
 * 2. + CIKs do universo ainda sem nenhuma linha SEC (entraram no universo esta semana);
 * 3. para cada CIK, UM POR VEZ (o JSON é descartado antes do próximo; RSS < 300 MB):
 *    companyfacts → extrairFundamentosSec (FY de 350–380 dias, último arquivado vence, ano pelo
 *    término) → AssetFundamentalsPeriod source 'SEC', versao +1 SÓ quando o FY muda (impressão
 *    digital dos valores/conceitos/flags; 10-K/A que reapresenta = versão nova).
 * Cursor no AnaliseJobRun.detalhes.cursor do último run ok/parcial (parcial não avança o cursor:
 * os CIKs do índice voltam no próximo run e a versão igual não é regravada).
 *
 * O backfill (scripts/analise-ativos/backfill-sec-fundamentos.ts) usa a mesma processarCikSec.
 * DONO: fatia A (docs/analise-ativos/stocks-reits/desenho.json).
 */
import type { PrismaClient } from '@prisma/client';
import {
  extrairFundamentosSec,
  type CompanyFactsSec,
  type PeriodoSec,
} from '@/services/analiseAtivos/eua/extrairFundamentosSec';
import { criarSecCliente, urlSec, type SecCliente } from '@/services/analiseAtivos/eua/secCliente';
import type { OpcoesExecucaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import {
  emissoresComFundamentosSec,
  gravarLinhasFundamentoSec,
  impressaoPeriodoSec,
  lerVersoesSec,
  linhaFundamentoSec,
  listarCiksFundamentosEua,
  type PeriodoSecGravavel,
} from '@/services/analiseAtivos/repositorio/eua';
import type { AlertaJob, JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';
import {
  FORMULARIOS_ANUAIS_SEC,
  SEC_URLS,
  emissorIdSec,
  normalizarCik,
} from '@/types/analiseAtivosEua';

/** Anos de histórico gravados (janela 10 = 11 valores + folga). */
export const ANOS_HISTORICO_SEC = 13;
export const MAX_DIAS_INDICE = 30;
export const DIAS_CURSOR_INICIAL = 3;
const MAX_ALERTAS_SANIDADE_POR_CIK = 3;

// ---------------------------------------------------------------- índice diário

export interface LinhaIndiceSec {
  form: string;
  cik: string;
  data: string;
}

/**
 * Linhas do form.AAAAMMDD.idx (largura fixa: Form Type, Company Name, CIK, Date Filed, File Name).
 * Os 3 últimos campos não têm espaço; o formulário é o texto antes da 1ª sequência de 2+ espaços.
 */
export function lerIndiceDiario(texto: string): LinhaIndiceSec[] {
  const out: LinhaIndiceSec[] = [];
  let corpo = false;
  for (const bruta of texto.split('\n')) {
    const linha = bruta.replace(/\r$/, '');
    if (!corpo) {
      if (/^-{10,}/.test(linha)) corpo = true;
      continue;
    }
    const partes = linha.trim().split(/\s+/);
    if (partes.length < 4) continue;
    const arquivo = partes[partes.length - 1];
    const data = partes[partes.length - 2];
    const cik = partes[partes.length - 3];
    const form = linha.trim().split(/\s{2,}/)[0];
    if (!/^\d{1,10}$/.test(cik) || !/^\d{8}$|^\d{4}-\d{2}-\d{2}$/.test(data) || !arquivo) continue;
    out.push({
      form,
      cik: normalizarCik(cik),
      data: data.includes('-') ? data : `${data.slice(0, 4)}-${data.slice(4, 6)}-${data.slice(6)}`,
    });
  }
  return out;
}

/** Datas (AAAA-MM-DD) do dia seguinte ao cursor até ontem, no máximo `max`. */
export function diasDoIndice(cursor: string, hoje: string, max = MAX_DIAS_INDICE): string[] {
  const out: string[] = [];
  const fim = Date.parse(`${hoje}T00:00:00Z`) - 86_400_000;
  let t = Date.parse(`${cursor}T00:00:00Z`) + 86_400_000;
  t = Math.max(t, fim - (max - 1) * 86_400_000);
  for (; t <= fim; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function urlIndiceDiario(data: string): string {
  const ano = data.slice(0, 4);
  const tri = Math.ceil(Number(data.slice(5, 7)) / 3);
  return urlSec(SEC_URLS.indiceDiario, { ano, trimestre: tri, data: data.replace(/-/g, '') });
}

// ---------------------------------------------------------------- normalização + versão

const r = (v: number | null, casas: number) =>
  v === null || !Number.isFinite(v) ? null : Number(v.toFixed(casas));

/** PeriodoSec → valores na escala das colunas (o que o banco devolve na leitura). */
export function normalizarPeriodoSec(p: PeriodoSec): PeriodoSecGravavel {
  return {
    emissorId: p.emissorId,
    anoFiscal: p.anoFiscal,
    dtIni: p.dtIni,
    dtFim: p.dtFim,
    accession: p.accession,
    dtEntrega: p.dtEntrega,
    dtEntregaOriginal: p.dtEntregaOriginal,
    sourceUrl: p.sourceUrl,
    dpaOrigem: p.dpaOrigem,
    sourceConcept: p.sourceConcept,
    flags: [...p.flags],
    receita: r(p.receita, 2),
    ebit: r(p.ebit, 2),
    depreciacaoAmortizacao: r(p.depreciacaoAmortizacao, 2),
    lucroLiquido: r(p.lucroLiquido, 2),
    lucroAtribuivel: r(p.lucroAtribuivel, 2),
    ativoTotal: r(p.ativoTotal, 2),
    caixa: r(p.caixa, 2),
    aplicacoesFinanceiras: r(p.aplicacoesFinanceiras, 2),
    dividaBrutaCp: r(p.dividaBrutaCp, 2),
    dividaBrutaLp: r(p.dividaBrutaLp, 2),
    pl: r(p.pl, 2),
    plControladora: r(p.plControladora, 2),
    fco: r(p.fco, 2),
    capex: r(p.capex, 2),
    dividendosJcpPagos: r(p.dividendosJcpPagos, 2),
    recompras: r(p.recompras, 2),
    acoesMediaDiluida: r(p.acoesMediaDiluida, 0),
    lpaOn: r(p.lpaOn, 6),
    dpa: r(p.dpa, 6),
  };
}

export interface ResultadoCikSec {
  cik: string;
  status: 'ok' | 'sem_companyfacts';
  periodos: number;
  novasVersoes: number;
  alertas: number;
}

/**
 * Baixa, extrai e grava UM CIK (job incremental e backfill). `cf` injetado = backfill pelo
 * companyfacts.zip (sem rede). Grava só FY novo ou alterado (versao = última + 1).
 */
export async function processarCikSec(
  prisma: Pick<PrismaClient, 'assetFundamentalsPeriod'>,
  cikFundamentos: string,
  opts: {
    cliente?: SecCliente;
    cf?: CompanyFactsSec | null;
    anoMinimo: number;
    aplicar: boolean;
    alertar?: (a: AlertaJob) => void;
    agora?: Date;
  },
): Promise<ResultadoCikSec> {
  const cik = normalizarCik(cikFundamentos);
  let cf: CompanyFactsSec | null | undefined = opts.cf;
  if (cf === undefined) {
    if (!opts.cliente) throw new Error('processarCikSec: sem cliente nem companyfacts');
    cf = await opts.cliente.obterJson<CompanyFactsSec>(urlSec(SEC_URLS.companyfacts, { cik }));
  }
  if (!cf) return { cik, status: 'sem_companyfacts', periodos: 0, novasVersoes: 0, alertas: 0 };
  const ext = extrairFundamentosSec(cf, { anoMinimo: opts.anoMinimo });
  cf = null; // libera o JSON antes de tocar no banco
  const gravadas = await lerVersoesSec(prisma, emissorIdSec(cik));
  const agora = opts.agora ?? new Date();
  const linhas = [];
  for (const p of ext.periodos) {
    const n = normalizarPeriodoSec(p);
    const g = gravadas.get(n.dtFim);
    if (g && g.impressao === impressaoPeriodoSec(n)) continue;
    linhas.push(linhaFundamentoSec(n, (g?.versao ?? 0) + 1, agora));
  }
  if (opts.alertar) {
    for (const a of ext.alertas.slice(-MAX_ALERTAS_SANIDADE_POR_CIK)) {
      opts.alertar({
        codigo: `sec_${a.codigo}`,
        nivel: 'info',
        mensagem: `CIK ${cik} FY${a.anoFiscal}: ${a.mensagem}`,
        ref: cik,
      });
    }
  }
  const novas = opts.aplicar ? await gravarLinhasFundamentoSec(prisma, linhas) : linhas.length;
  return {
    cik,
    status: 'ok',
    periodos: ext.periodos.length,
    novasVersoes: novas,
    alertas: ext.alertas.length,
  };
}

// ---------------------------------------------------------------- job

export interface DependenciasSecFundamentos {
  cliente: SecCliente;
  /** cursor do último run (AAAA-MM-DD) — padrão: AnaliseJobRun.detalhes.cursor */
  cursor?: (prisma: PrismaClient) => Promise<string | null>;
}

async function cursorDoUltimoRun(prisma: PrismaClient): Promise<string | null> {
  const run = await prisma.analiseJobRun.findFirst({
    where: { job: 'sec-fundamentos', status: { in: ['ok', 'parcial'] } },
    orderBy: { inicio: 'desc' },
    select: { detalhes: true },
  });
  const d = run?.detalhes as { cursor?: unknown } | null | undefined;
  return typeof d?.cursor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.cursor) ? d.cursor : null;
}

export async function sincronizarSecFundamentos(
  ctx: JobContexto,
  deps: DependenciasSecFundamentos,
): Promise<ResultadoJob> {
  const { prisma } = ctx;
  const universo = await listarCiksFundamentosEua(prisma);
  if (universo.length === 0) {
    return { pulado: 'universo EUA vazio (rodar o sec-cadastro antes)' };
  }
  const doUniverso = new Set(universo.map((u) => u.cikFundamentos));
  const comDados = await emissoresComFundamentosSec(prisma);

  const cursorAnterior = await (deps.cursor ?? cursorDoUltimoRun)(prisma);
  const inicial = new Date(Date.parse(`${ctx.hoje}T00:00:00Z`) - DIAS_CURSOR_INICIAL * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const cursor = cursorAnterior ?? inicial;
  const dias = diasDoIndice(cursor, ctx.hoje);
  const formas = new Set<string>(FORMULARIOS_ANUAIS_SEC);
  const doIndice = new Set<string>();
  let novoCursor = cursor;
  let indicesLidos = 0;
  for (const dia of dias) {
    if (ctx.estourouPrazo()) break;
    const resp = await deps.cliente.obter(urlIndiceDiario(dia), { ausentes: [403] });
    if (resp.status === 200 && resp.texto) {
      indicesLidos++;
      for (const l of lerIndiceDiario(resp.texto)) {
        if (formas.has(l.form) && doUniverso.has(l.cik)) doIndice.add(l.cik);
      }
    }
    novoCursor = dia;
  }

  const pendentes = universo
    .map((u) => u.cikFundamentos)
    .filter((c) => doIndice.has(c) || !comDados.has(emissorIdSec(c)));
  const anoMinimo = Number(ctx.hoje.slice(0, 4)) - ANOS_HISTORICO_SEC;
  let parcial = false;
  let processados = 0;
  let novasVersoes = 0;
  let semCompanyfacts = 0;
  for (const cik of pendentes) {
    if (ctx.estourouPrazo()) {
      parcial = true;
      break;
    }
    const r1 = await processarCikSec(prisma, cik, {
      cliente: deps.cliente,
      anoMinimo,
      aplicar: ctx.aplicar,
      alertar: ctx.alertar,
    });
    processados++;
    ctx.contar('linhasLidas', r1.periodos);
    ctx.contar('linhasGravadas', r1.novasVersoes);
    novasVersoes += r1.novasVersoes;
    if (r1.status === 'sem_companyfacts') {
      semCompanyfacts++;
      ctx.contar('rejeitadas');
      ctx.alertar({
        codigo: 'sem_companyfacts',
        nivel: 'aviso',
        mensagem: `CIK ${cik} sem companyfacts na SEC (404)`,
        ref: cik,
      });
    }
  }

  return {
    ...(parcial ? { parcial: true } : {}),
    detalhes: {
      cursor: parcial ? cursor : novoCursor,
      cursorAnterior,
      indicesLidos,
      ciksDoIndice: doIndice.size,
      pendentes: pendentes.length,
      processados,
      novasVersoes,
      semCompanyfacts,
      requisicoesSec: deps.cliente.requisicoes(),
    },
  };
}

export async function jobSecFundamentos(
  ctx: JobContexto,
  _opcoes?: OpcoesExecucaoJob,
): Promise<ResultadoJob> {
  return sincronizarSecFundamentos(ctx, { cliente: criarSecCliente() });
}
