/**
 * Job 'sec-cadastro' (semanal, domingo 03:30 UTC pelo myfinance-job.sh; pesado, ≤ 600 s).
 *
 * 1. Baixa company_tickers_exchange.json (≈ 10 mil linhas; ticker SEMPRE daqui) e os frames
 *    dei/EntityPublicFloat (USD), dei/EntityCommonStockSharesOutstanding (preço implícito) e
 *    us-gaap/Assets (float ÷ ativo, erro de escala) dos últimos 8 trimestres fechados — o float é
 *    anual por natureza (capa do 10-K, 2º trimestre fiscal) e um exercício que termina em setembro
 *    tem float de março do ano anterior. O float vem de mais 4 trimestres para trás quando o 10-K
 *    que o trouxe é recente (AMD: o 10-K de fev/2026 repetiu o float de jun/2024);
 * 2. candidatos = CIKs NYSE/Nasdaq com float ≥ o menor corte de saída (US$ 1,6 bi) + quem já está
 *    gravado + overrides de inclusão/classificação (AVB fora do arquivo; XOM com cikHistorico);
 * 3. submissions/CIK##########.json SÓ de CIK novo, sem SIC, ou com 10-K novo (accession do float
 *    ≠ ultimo10k gravado) — a 1ª carga (~1.400 CIKs, ~6 min a 4 req/s) é manual pelo runner;
 * 4. universo por CIK com histerese e sanidade de float (universoEua.decidirUniverso; params =
 *    universoEuaDe(criteria_params vigente), sem versão no banco = UNIVERSO_EUA_PADRAO);
 * 5. grava SecCompany e SecCompanyTicker; quem saiu dos candidatos fica fora do universo.
 *
 * Alertas: float_suspeito, ticker_sem_10k, reit_por_sic_suspeito (e reit_sem_segmento, info).
 * Prazo estourado ⇒ 'parcial' (o próximo run continua: os não processados seguem "novos").
 * DEV: ANALISE_EUA_AMOSTRA_CIKS=320193,789019,… restringe aos CIKs listados (alerta 'amostra').
 *
 * DONO: fatia A (docs/analise-ativos/stocks-reits/desenho.json).
 */
import type { PrismaClient } from '@prisma/client';
import { criarSecCliente, urlSec, type SecCliente } from '@/services/analiseAtivos/eua/secCliente';
import { ciksComOverride, overrideDoCik } from '@/services/analiseAtivos/eua/overridesEua';
import {
  decidirUniverso,
  menorCorteBusca,
  tickersListados,
  type CandidatoUniverso,
  type TickerSec,
} from '@/services/analiseAtivos/eua/universoEua';
import type { OpcoesExecucaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import { obterCriteriaParams } from '@/services/analiseAtivos/params/obterCriteriaParams';
import { universoEuaDe } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import {
  gravarEmpresaSec,
  lerCadastrosGravadosEua,
  marcarForaDoUniversoEua,
  sincronizarTickersSec,
  type CadastroGravadoEua,
} from '@/services/analiseAtivos/repositorio/eua';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';
import {
  FORMULARIOS_ANUAIS_SEC,
  SEC_URLS,
  UNIVERSO_EUA_PADRAO,
  normalizarCik,
  type UniversoEuaParams,
} from '@/types/analiseAtivosEua';

export const TRIMESTRES_FLOAT = 8;
/** Trimestres extras só do float, aceitos quando o accession é do ano corrente ou do anterior. */
export const TRIMESTRES_FLOAT_REPETIDO = 4;

/** Ano do accession '0000002488-26-000018' → 2026. */
export function anoDoAccession(accn: string): number | null {
  const m = /^\d{10}-(\d{2})-\d{6}$/.exec(accn);
  return m ? 2000 + Number(m[1]) : null;
}

/**
 * Float vigente: o de data mais recente nos 8 trimestres; sem ele, o dos 4 anteriores só se veio
 * de um 10-K arquivado neste ano ou no anterior (float antigo repetido na capa nova).
 */
export function floatsVigentes(
  recentes: Map<string, { val: number; end: string; accn: string }>,
  antigos: Map<string, { val: number; end: string; accn: string }>,
  hoje: string,
): Map<string, { val: number; end: string; accn: string }> {
  const out = new Map(recentes);
  const anoMin = Number(hoje.slice(0, 4)) - 1;
  for (const [cik, f] of antigos) {
    if (out.has(cik)) continue;
    const ano = anoDoAccession(f.accn);
    if (ano !== null && ano >= anoMin) out.set(cik, f);
  }
  return out;
}
export const ENV_AMOSTRA_CIKS = 'ANALISE_EUA_AMOSTRA_CIKS';

// ---------------------------------------------------------------- formatos da SEC

export interface ArquivoTickersBolsa {
  fields: string[];
  data: (string | number | null)[][];
}

export interface FrameSec {
  data: { accn: string; cik: number; entityName: string; end: string; val: number }[];
}

export interface SubmissionsSec {
  cik: string | number;
  name: string;
  sic?: string | null;
  sicDescription?: string | null;
  fiscalYearEnd?: string | null;
  tickers?: string[];
  exchanges?: (string | null)[];
  filings?: { recent?: { accessionNumber?: string[]; filingDate?: string[]; form?: string[] } };
}

// ---------------------------------------------------------------- funções puras

/** Linhas do company_tickers_exchange.json por CIK, na ordem do arquivo. */
export function tickersPorCik(
  arq: ArquivoTickersBolsa,
): Map<string, { nome: string; tickers: TickerSec[] }> {
  const iCik = arq.fields.indexOf('cik');
  const iNome = arq.fields.indexOf('name');
  const iTicker = arq.fields.indexOf('ticker');
  const iBolsa = arq.fields.indexOf('exchange');
  if ([iCik, iNome, iTicker, iBolsa].some((i) => i < 0)) {
    throw new Error(`company_tickers_exchange.json mudou de layout: ${arq.fields.join(',')}`);
  }
  const out = new Map<string, { nome: string; tickers: TickerSec[] }>();
  for (const r of arq.data) {
    if (r[iCik] === null || r[iTicker] === null) continue;
    const cik = normalizarCik(String(r[iCik]));
    const e = out.get(cik) ?? { nome: String(r[iNome] ?? ''), tickers: [] };
    e.tickers.push({
      symbol: String(r[iTicker]).toUpperCase(),
      bolsa: (r[iBolsa] as string) ?? null,
    });
    out.set(cik, e);
  }
  return out;
}

/** 'CY2026Q3I', … — os `n` trimestres FECHADOS até `hoje`, do mais recente para o mais antigo. */
export function trimestresFechados(hoje: string, n: number): string[] {
  let ano = Number(hoje.slice(0, 4));
  let tri = Math.ceil(Number(hoje.slice(5, 7)) / 3) - 1; // o trimestre corrente ainda não fechou
  const out: string[] = [];
  while (out.length < n) {
    if (tri === 0) {
      ano--;
      tri = 4;
    }
    out.push(`CY${ano}Q${tri}I`);
    tri--;
  }
  return out;
}

/** Valor mais recente por CIK entre vários frames (maior `end`; empate: maior accession). */
export function maisRecentePorCik(
  frames: readonly (FrameSec | null)[],
): Map<string, { val: number; end: string; accn: string }> {
  const out = new Map<string, { val: number; end: string; accn: string }>();
  for (const f of frames) {
    for (const d of f?.data ?? []) {
      const cik = normalizarCik(d.cik);
      const cur = out.get(cik);
      if (!cur || d.end > cur.end || (d.end === cur.end && d.accn > cur.accn)) {
        out.set(cik, { val: d.val, end: d.end, accn: d.accn });
      }
    }
  }
  return out;
}

/** Dados do submissions usados no cadastro. */
export interface ResumoSubmissions {
  nome: string;
  sic: number | null;
  sicDescricao: string | null;
  exercicioFimMmdd: string | null;
  tickers: TickerSec[];
  ultimo10k: string | null;
  ultimo10kEm: string | null;
}

export function resumirSubmissions(s: SubmissionsSec): ResumoSubmissions {
  const sic = s.sic ? Number(s.sic) : NaN;
  const r = s.filings?.recent;
  let ultimo10k: string | null = null;
  let ultimo10kEm: string | null = null;
  const formas = new Set<string>(FORMULARIOS_ANUAIS_SEC);
  (r?.form ?? []).forEach((f, i) => {
    if (!formas.has(f)) return;
    const data = r?.filingDate?.[i] ?? null;
    if (data && (ultimo10kEm === null || data > ultimo10kEm)) {
      ultimo10kEm = data;
      ultimo10k = r?.accessionNumber?.[i] ?? null;
    }
  });
  const fye = s.fiscalYearEnd && /^\d{4}$/.test(s.fiscalYearEnd) ? s.fiscalYearEnd : null;
  return {
    nome: s.name,
    sic: Number.isInteger(sic) ? sic : null,
    sicDescricao: s.sicDescription ?? null,
    exercicioFimMmdd: fye,
    tickers: (s.tickers ?? []).map((t, i) => ({
      symbol: t.toUpperCase(),
      bolsa: s.exchanges?.[i] ?? null,
    })),
    ultimo10k,
    ultimo10kEm,
  };
}

/** CIKs da amostra de DEV (ANALISE_EUA_AMOSTRA_CIKS), ou null sem a variável. */
export function amostraCiks(env: NodeJS.ProcessEnv = process.env): Set<string> | null {
  const v = env[ENV_AMOSTRA_CIKS]?.trim();
  if (!v) return null;
  return new Set(
    v
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((c) => normalizarCik(c)),
  );
}

// ---------------------------------------------------------------- job

export interface DependenciasSecCadastro {
  cliente: SecCliente;
  /** universo vigente; padrão: universoEuaDe(criteria_params ativa) ou UNIVERSO_EUA_PADRAO */
  universo?: (prisma: PrismaClient) => Promise<UniversoEuaParams | null>;
  amostra?: Set<string> | null;
}

async function universoVigente(prisma: PrismaClient): Promise<UniversoEuaParams | null> {
  try {
    return universoEuaDe((await obterCriteriaParams(prisma)).params);
  } catch {
    return null;
  }
}

export async function sincronizarSecCadastro(
  ctx: JobContexto,
  deps: DependenciasSecCadastro,
): Promise<ResultadoJob> {
  const { prisma } = ctx;
  const cli = deps.cliente;
  const amostra = deps.amostra ?? null;
  if (amostra) {
    ctx.alertar({
      codigo: 'amostra',
      nivel: 'aviso',
      mensagem: `${ENV_AMOSTRA_CIKS}: só ${amostra.size} CIKs (DEV)`,
    });
  }
  let params = await (deps.universo ?? universoVigente)(prisma);
  if (!params) {
    params = UNIVERSO_EUA_PADRAO;
    ctx.alertar({
      codigo: 'params_eua_padrao',
      nivel: 'info',
      mensagem: 'criteria_params sem universoEua no banco: usando UNIVERSO_EUA_PADRAO do código',
    });
  }

  // 1. arquivos de lista
  const arq = await cli.obterJson<ArquivoTickersBolsa>(SEC_URLS.tickersBolsa);
  if (!arq) throw new Error('company_tickers_exchange.json indisponível (404)');
  const porCik = tickersPorCik(arq);
  const todosTris = trimestresFechados(ctx.hoje, TRIMESTRES_FLOAT + TRIMESTRES_FLOAT_REPETIDO);
  const tris = todosTris.slice(0, TRIMESTRES_FLOAT);
  const frames = async (
    taxonomia: string,
    conceito: string,
    unidade: string,
    periodos: readonly string[] = tris,
  ) => {
    const lidos: (FrameSec | null)[] = [];
    for (const periodo of periodos) {
      lidos.push(
        await cli.obterJson<FrameSec>(
          urlSec(SEC_URLS.frames, { taxonomia, conceito, unidade, periodo }),
        ),
      );
    }
    return maisRecentePorCik(lidos);
  };
  const floats = floatsVigentes(
    await frames('dei', 'EntityPublicFloat', 'USD'),
    await frames('dei', 'EntityPublicFloat', 'USD', todosTris.slice(TRIMESTRES_FLOAT)),
    ctx.hoje,
  );
  const acoes = await frames('dei', 'EntityCommonStockSharesOutstanding', 'shares');
  const ativos = await frames('us-gaap', 'Assets', 'USD');
  ctx.contar('linhasLidas', arq.data.length);

  // 2. candidatos
  const gravados = await lerCadastrosGravadosEua(prisma);
  const corteBusca = menorCorteBusca(params);
  const candidatos = new Set<string>();
  for (const [cik, e] of porCik) {
    if (tickersListados(e.tickers).length === 0) continue;
    const f = floats.get(cik)?.val ?? null;
    if ((f !== null && f >= corteBusca) || gravados.has(cik)) candidatos.add(cik);
  }
  for (const cik of ciksComOverride()) candidatos.add(cik);
  for (const [cik, g] of gravados) if (g.noUniverso) candidatos.add(cik);
  const lista = [...candidatos].filter((c) => !amostra || amostra.has(c)).sort();

  // 3–5. um CIK por vez
  let submissions = 0;
  let noUniverso = 0;
  let processados = 0;
  let parcial = false;
  const vistos = new Set<string>();
  for (const cik of lista) {
    if (ctx.estourouPrazo()) {
      parcial = true;
      break;
    }
    const ov = overrideDoCik(cik);
    const cikFloat = ov?.cikHistorico && !floats.has(cik) ? ov.cikHistorico : cik;
    const fl = floats.get(cik) ?? floats.get(cikFloat) ?? null;
    const g: CadastroGravadoEua | undefined = gravados.get(cik);
    const doArquivo = porCik.get(cik);
    const precisaSubmissions =
      !g || g.sic === null || (fl !== null && fl.accn !== g.ultimo10k) || !doArquivo;
    let resumo: ResumoSubmissions | null = null;
    if (precisaSubmissions) {
      const s = await cli.obterJson<SubmissionsSec>(urlSec(SEC_URLS.submissions, { cik }));
      submissions++;
      resumo = s ? resumirSubmissions(s) : null;
    }
    vistos.add(cik);
    const tickers = doArquivo?.tickers ?? resumo?.tickers ?? [];
    const nome = doArquivo?.nome || resumo?.nome || g?.nome || cik;
    const sic = resumo?.sic ?? g?.sic ?? null;
    const ultimo10k = resumo ? resumo.ultimo10k : (g?.ultimo10k ?? null);
    const ultimo10kEm = resumo ? resumo.ultimo10kEm : (g?.ultimo10kEm ?? null);
    const candidato: CandidatoUniverso = {
      cik,
      nome,
      tickers,
      sic,
      publicFloatUsd: fl?.val ?? null,
      publicFloatData: fl?.end ?? null,
      acoesEmCirculacao: acoes.get(cik)?.val ?? acoes.get(cikFloat)?.val ?? null,
      ativoTotalUsd: ativos.get(cik)?.val ?? ativos.get(cikFloat)?.val ?? null,
      tem10k: ultimo10k !== null,
      noUniversoAnterior: g?.noUniverso ?? false,
    };
    const d = decidirUniverso(candidato, params, ov);
    for (const a of d.alertas) {
      ctx.alertar({
        codigo: a.codigo,
        nivel: a.codigo === 'reit_sem_segmento' ? 'info' : 'aviso',
        mensagem: `${tickers[0]?.symbol ?? cik} (CIK ${cik}): ${a.mensagem}`,
        ref: cik,
      });
    }
    if (ctx.aplicar) {
      await gravarEmpresaSec(prisma, {
        cik,
        nome,
        sic,
        sicDescricao: resumo?.sicDescricao ?? g?.sicDescricao ?? null,
        exercicioFimMmdd: resumo?.exercicioFimMmdd ?? g?.exercicioFimMmdd ?? null,
        bolsa: d.bolsa,
        publicFloatUsd: candidato.publicFloatUsd,
        publicFloatData: candidato.publicFloatData,
        floatSanidade: d.floatSanidade,
        classe: d.classe,
        ehReit: d.ehReit,
        reitTipo: d.reitTipo,
        segmento: d.segmento,
        ehFinanceira: d.ehFinanceira,
        noUniverso: d.noUniverso,
        foraMotivo: d.foraMotivo,
        cikHistorico: d.cikHistorico,
        origem: d.origem,
        ultimo10k,
        ultimo10kEm,
      });
      const listados = tickersListados(tickers).map((t) => t.symbol);
      ctx.contar(
        'linhasGravadas',
        1 + (await sincronizarTickersSec(prisma, cik, listados, ctx.hoje)),
      );
    }
    processados++;
    if (d.noUniverso) noUniverso++;
    else ctx.contar('rejeitadas');
  }

  // quem estava no universo e não é mais candidato (delistado / float muito abaixo)
  let saidas = 0;
  if (!parcial && ctx.aplicar) {
    const sairam = [...gravados.values()]
      .filter((g) => g.noUniverso && !vistos.has(g.cik) && (!amostra || amostra.has(g.cik)))
      .map((g) => g.cik);
    saidas = await marcarForaDoUniversoEua(prisma, sairam, 'float_abaixo');
  }

  return {
    ...(parcial ? { parcial: true } : {}),
    detalhes: {
      candidatos: lista.length,
      processados,
      noUniverso,
      saidas,
      submissions,
      requisicoesSec: cli.requisicoes(),
      trimestresFloat: tris,
      corteEntradaStockUsd: params.stock.floatEntradaUsd,
      corteSaidaStockUsd: params.stock.floatSaidaUsd,
      corteEntradaReitUsd: params.reit.floatEntradaUsd,
      ...(amostra ? { amostra: amostra.size } : {}),
    },
  };
}

export async function jobSecCadastro(
  ctx: JobContexto,
  _opcoes?: OpcoesExecucaoJob,
): Promise<ResultadoJob> {
  return sincronizarSecCadastro(ctx, { cliente: criarSecCliente(), amostra: amostraCiks() });
}
