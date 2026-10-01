/**
 * Alertas dos jobs da Análise de Ativos (substitui o stub da fatia 0, MESMA assinatura).
 *
 * Depois de cada run (chamado por executarJobAnalise, com o run já fechado no banco):
 *  - sempre registra o resumo no logger (info/warn/error como no stub);
 *  - ALERTA quando deveAlertar(últimas execuções do job) — 2 falhas/abandonos seguidos, repetição no
 *    máx. 1×/24h — ou quando o run traz alerta de nível 'erro' (ErroLayoutFonte: já na 1ª vez);
 *  - o alerta é sempre `logger.error('[analise-ativos][ALERTA] …')` (vai para o log do app, lido
 *    pelo /var/log do servidor);
 *  - Notification (sino) para cada User role=admin SÓ com ANALISE_ATIVOS_ALERTA_ADMIN="true" E
 *    NODE_ENV=production: escrever em Notification muda o sino dos admins em prod (tabela existente),
 *    por isso fica desligado por padrão. Sem push.
 *  - nunca lança (erro interno vira logger.error).
 */
import type { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';
import { analiseAtivosAlertaAdmin } from '@/lib/analiseAtivosConfig';
import { deveAlertar } from '@/services/analiseAtivos/regras/eventos/alertasFrescor';
import { ultimasExecucoes } from '@/services/analiseAtivos/repositorio/jobs';
import type { RelatorioJob } from '@/services/analiseAtivos/tipos';

export const TIPO_NOTIFICACAO_ALERTA = 'analise_ativos_alerta';
/** execuções lidas para decidir (a regra simula a repetição de 24 h dentro desta janela) */
const JANELA_EXECUCOES = 10;

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

function registrarResumo(r: RelatorioJob): void {
  const resumo = {
    job: r.job,
    status: r.status,
    duracaoMs: r.duracaoMs,
    linhasLidas: r.linhasLidas,
    linhasGravadas: r.linhasGravadas,
    rejeitadas: r.rejeitadas,
    rssPicoMb: r.rssPicoMb,
    alertas: r.alertas.length,
  };
  if (r.status === 'falha') {
    logger.error('[analise-ativos] job falhou', { ...resumo, erro: r.erro });
  } else if (r.alertas.some((a) => a.nivel === 'erro' || a.nivel === 'aviso')) {
    logger.warn('[analise-ativos] job com alertas', resumo);
  } else {
    logger.info('[analise-ativos] job concluído', resumo);
  }
}

async function motivoDoAlerta(prisma: PrismaClient, r: RelatorioJob): Promise<string | null> {
  const erros = r.alertas.filter((a) => a.nivel === 'erro');
  if (erros.length > 0) return erros.map((a) => `${a.codigo}: ${a.mensagem}`).join(' | ');
  if (r.status !== 'falha') return null;
  const execucoes = await ultimasExecucoes(prisma, r.job, JANELA_EXECUCOES);
  const d = deveAlertar(execucoes, new Date());
  return d.alertar ? `${d.motivo}${r.erro ? ` — ${r.erro}` : ''}` : null;
}

async function notificarAdmins(prisma: PrismaClient, r: RelatorioJob, motivo: string) {
  const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
  if (admins.length === 0) return;
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: TIPO_NOTIFICACAO_ALERTA,
      title: `Análise de Ativos: job ${r.job} com problema`,
      message: motivo.slice(0, 500),
      metadata: { job: r.job, runId: r.id, status: r.status },
    })),
  });
}

export async function notificarResultadoJob(prisma: PrismaClient, r: RelatorioJob): Promise<void> {
  try {
    registrarResumo(r);
    const motivo = await motivoDoAlerta(prisma, r);
    if (!motivo) return;
    logger.error(`[analise-ativos][ALERTA] ${r.job}: ${motivo}`, {
      job: r.job,
      runId: r.id,
      status: r.status,
    });
    if (process.env.NODE_ENV === 'production' && analiseAtivosAlertaAdmin()) {
      await notificarAdmins(prisma, r, motivo);
    }
  } catch (e: unknown) {
    try {
      logger.error('[analise-ativos] falha ao processar alerta do job', {
        job: r.job,
        erro: mensagemDe(e),
      });
    } catch {
      // nunca propaga
    }
  }
}
