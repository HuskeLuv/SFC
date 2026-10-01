/**
 * Wrapper de execução dos jobs da Análise de Ativos (cron e scripts), com trilha em AnaliseJobRun.
 *
 * - Lock: checagem + INSERT do run 'executando' numa transação com pg_advisory_xact_lock(hashtext(job))
 *   — dois curls simultâneos não passam os dois. Run 'executando' mais novo que lockTtl ⇒ 'pulado';
 *   mais velho (processo morreu/curl expirou) ⇒ marcado 'abandonado' e segue.
 * - Prazo interno (240 s por padrão; o cron corta em 300 s): o job consulta ctx.estourouPrazo() e
 *   devolve { parcial: true } para continuar no próximo run.
 * - RSS amostrado a cada 500 ms; delta > 300 MB ⇒ alerta 'rss_acima_limite' nível erro (não aborta).
 * - ScoringParams: sem versão ativa válida no banco, jobs de ingestão usam SCORING_PARAMS_V1 do código
 *   com alerta 'params_fallback_codigo'; jobs que exigem params do banco ('scores') falham.
 * - ErroLayoutFonte ⇒ 'falha' + alerta nível erro. Nunca lança: devolve RelatorioJob.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma as prismaApp } from '@/lib/prisma';
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import { notificarResultadoJob } from '@/services/analiseAtivos/observabilidade/alertas';
import { obterScoringParams } from '@/services/analiseAtivos/params/obterScoringParams';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type {
  AlertaJob,
  JobContexto,
  NomeJob,
  RelatorioJob,
  ResultadoJob,
  ScoringParams,
} from '@/services/analiseAtivos/tipos';

export const PRAZO_PADRAO_MS = 240_000;
export const LOCK_TTL_PADRAO_MS = 600_000;
export const LIMITE_RSS_DELTA_MB = 300;
export const MAX_ALERTAS = 200;
const INTERVALO_RSS_MS = 500;

export interface OpcoesJob {
  prazoMs?: number;
  lockTtlMs?: number;
  origem?: 'cron' | 'script';
  aplicar?: boolean;
  parametros?: Record<string, unknown>;
  /** true só em 'scores' (padrão: job === 'scores') */
  exigeParamsDoBanco?: boolean;
  /** injeção para testes/scripts; padrão = src/lib/prisma */
  prisma?: PrismaClient;
}

const rssMb = () => Math.round(process.memoryUsage().rss / 1024 / 1024);
const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e));
const comoJson = (v: unknown) => v as Prisma.InputJsonValue;

export async function executarJobAnalise(
  job: NomeJob,
  fn: (ctx: JobContexto) => Promise<ResultadoJob>,
  opts: OpcoesJob = {},
): Promise<RelatorioJob> {
  const inicio = Date.now();
  const prazoMs = opts.prazoMs ?? PRAZO_PADRAO_MS;
  const lockTtlMs = opts.lockTtlMs ?? LOCK_TTL_PADRAO_MS;
  const origem = opts.origem ?? 'cron';
  const exigeParams = opts.exigeParamsDoBanco ?? job === 'scores';
  const rssInicio = rssMb();
  let rssPico = rssInicio;

  const alertas: AlertaJob[] = [];
  let alertasDescartados = 0;
  const contadores = { linhasLidas: 0, linhasGravadas: 0, rejeitadas: 0 };
  const alertar = (a: AlertaJob) => {
    if (alertas.length < MAX_ALERTAS) alertas.push(a);
    else alertasDescartados++;
  };

  const relatorio = (id: string, status: RelatorioJob['status'], erro?: string): RelatorioJob => ({
    id,
    job,
    status,
    duracaoMs: Date.now() - inicio,
    ...contadores,
    alertas: [...alertas],
    rssPicoMb: rssPico,
    ...(erro !== undefined ? { erro } : {}),
  });

  const notificar = async (prisma: PrismaClient, r: RelatorioJob) => {
    try {
      await notificarResultadoJob(prisma, r);
    } catch (e: unknown) {
      logger.error('[analise-ativos] notificarResultadoJob falhou', { job, erro: mensagemDe(e) });
    }
  };

  const prisma: PrismaClient = opts.prisma ?? prismaApp;

  // 1. Lock + registro do run
  let runId: string;
  try {
    const agora = new Date();
    const r = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${job}::text))`;
      const aberto = await tx.analiseJobRun.findFirst({
        where: { job, status: 'executando' },
        orderBy: { inicio: 'desc' },
      });
      if (aberto && agora.getTime() - aberto.inicio.getTime() < lockTtlMs) {
        const pulado = await tx.analiseJobRun.create({
          data: {
            job,
            origem,
            status: 'pulado',
            fim: agora,
            duracaoMs: 0,
            rssInicioMb: rssInicio,
            rssPicoMb: rssInicio,
            parametros: opts.parametros ? comoJson(opts.parametros) : undefined,
            erro: `já em execução (run ${aberto.id})`,
          },
        });
        return { tipo: 'pulado' as const, id: pulado.id, abertoId: aberto.id };
      }
      if (aberto) {
        await tx.analiseJobRun.updateMany({
          where: {
            job,
            status: 'executando',
            inicio: { lt: new Date(agora.getTime() - lockTtlMs) },
          },
          data: {
            status: 'abandonado',
            fim: agora,
            erro: 'lock expirado (processo interrompido?)',
          },
        });
      }
      const run = await tx.analiseJobRun.create({
        data: {
          job,
          origem,
          status: 'executando',
          rssInicioMb: rssInicio,
          parametros: opts.parametros ? comoJson(opts.parametros) : undefined,
        },
      });
      return { tipo: 'run' as const, id: run.id, abertoId: null };
    });
    if (r.tipo === 'pulado') {
      const rel = relatorio(r.id, 'pulado', `já em execução (run ${r.abertoId})`);
      await notificar(prisma, rel);
      return rel;
    }
    runId = r.id;
  } catch (e: unknown) {
    const rel = relatorio('', 'falha', `não foi possível registrar o run: ${mensagemDe(e)}`);
    await notificar(prisma, rel);
    return rel;
  }

  const amostrador = setInterval(() => {
    rssPico = Math.max(rssPico, rssMb());
  }, INTERVALO_RSS_MS);
  amostrador.unref?.();

  let status: RelatorioJob['status'] = 'ok';
  let erro: string | undefined;
  let detalhes: Record<string, unknown> | undefined;
  try {
    // 2. ScoringParams
    let params: ScoringParams;
    let paramsVersion: number;
    try {
      const p = await obterScoringParams(prisma);
      params = p.params;
      paramsVersion = p.versao;
    } catch (e: unknown) {
      if (exigeParams) throw e;
      params = SCORING_PARAMS_V1;
      paramsVersion = SCORING_PARAMS_V1.versao;
      alertar({
        codigo: 'params_fallback_codigo',
        nivel: 'aviso',
        mensagem: `ScoringParams do banco indisponível (${mensagemDe(e)}); usando v1 do código`,
      });
    }

    // 3. Execução
    const prazo = inicio + prazoMs;
    const ctx: JobContexto = {
      prisma,
      prazo,
      restanteMs: () => Math.max(0, prazo - Date.now()),
      estourouPrazo: () => Date.now() >= prazo,
      alertar,
      contar: (campo, n = 1) => {
        contadores[campo] += n;
      },
      params,
      paramsVersion,
      hoje: new Date().toISOString().slice(0, 10),
      origem,
      aplicar: opts.aplicar ?? true,
    };
    const resultado = await fn(ctx);
    status = resultado.parcial ? 'parcial' : 'ok';
    detalhes = resultado.detalhes;
  } catch (e: unknown) {
    status = 'falha';
    erro = mensagemDe(e);
    if (e instanceof ErroLayoutFonte) {
      alertar({ codigo: 'layout_fonte', nivel: 'erro', mensagem: e.message, ref: e.arquivo });
    }
  } finally {
    clearInterval(amostrador);
    rssPico = Math.max(rssPico, rssMb());
  }

  // nível ERRO (notifica já na 1ª vez): no Lightsail a RAM de 1,9 GB é dividida com o app e o
  // Postgres — um 'aviso' com status 'ok' passava despercebido (achado qa-operacao 30/09)
  if (rssPico - rssInicio > LIMITE_RSS_DELTA_MB) {
    alertar({
      codigo: 'rss_acima_limite',
      nivel: 'erro',
      mensagem: `RSS subiu ${rssPico - rssInicio} MB (limite ${LIMITE_RSS_DELTA_MB})`,
    });
  }

  // 4. Fechamento do run
  const rel = relatorio(runId, status, erro);
  const alertasGravados: unknown[] = [...alertas];
  if (alertasDescartados > 0) {
    alertasGravados.push({
      codigo: 'alertas_truncados',
      nivel: 'aviso',
      mensagem: `${alertasDescartados} alertas além de ${MAX_ALERTAS} descartados`,
    });
  }
  try {
    await prisma.analiseJobRun.update({
      where: { id: runId },
      data: {
        status,
        fim: new Date(),
        duracaoMs: rel.duracaoMs,
        ...contadores,
        alertas: comoJson(alertasGravados),
        erro: erro ?? null,
        rssPicoMb: rssPico,
        detalhes: detalhes ? comoJson(detalhes) : undefined,
      },
    });
  } catch (e: unknown) {
    logger.error('[analise-ativos] falha ao fechar AnaliseJobRun', {
      job,
      runId,
      erro: mensagemDe(e),
    });
  }
  await notificar(prisma, rel);
  return rel;
}

/** 200 para ok/parcial/pulado; 500 para falha (o cron registra o código no log). */
export function respostaCron(r: RelatorioJob): NextResponse {
  return NextResponse.json(r, { status: r.status === 'falha' ? 500 : 200 });
}
