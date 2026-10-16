/**
 * Cron semanal de retenção LGPD (ATENÇÃO Sprint D do plano).
 *
 * Aplica políticas de retenção mínima documentadas na política de
 * privacidade e em docs/incident-response.md:
 *
 *  - ConsultantInvite pendente > 30 dias: deleta (o e-mail do convidado
 *    estava parado em "armazém de PII órfã" — Art. 16). Convites já
 *    aceitos/rejeitados são preservados como trilha de auditoria.
 *  - ConsultantImpersonationLog > 12 meses: deleta (IP + UA + sessionToken
 *    são PII de auditoria; manter "para sempre" fere minimização).
 *  - LoginEvent > 90 dias: deleta (IP + UA da trilha de login; 90 dias
 *    cobrem investigação de incidente sem reter PII indefinidamente).
 *  - UserChangeLog > 12 meses: deleta (histórico de alterações do usuário
 *    contém IP + UA e valores antes/depois; 1 ano de trilha é suficiente).
 *  - Relatos de dado incorreto da Análise de Ativos (bloco C, decisão 19):
 *    caso FECHADO há > 12 meses → anonimiza o texto livre do relato
 *    (mensagem/valor esperado/fonte); o caso e a auditoria ficam.
 *  - Avisos das listas da Análise de Ativos (bloco 1) > 90 dias: apaga os
 *    envios (analise_alerta_envios) e as Notification type
 *    'analise_ativos_salvos_alerta' — o mesmo prazo do texto da tela ("ficam
 *    aqui por 90 dias"); o job alertas-salvos faz a mesma limpeza por redundância.
 *
 * Agendado em vercel.json: domingo 05:00 UTC (sem conflito com os crons
 * de mercado que rodam 06-08 UTC).
 *
 * Idempotente — `deleteMany` com `where` data é seguro em re-runs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';
import { anonimizarReportesRetencao } from '@/services/analiseAtivos/curadoria/privacidadeReportes';
import { apagarAvisosVencidos } from '@/services/analiseAtivos/alertas/avisosDoUsuario';

const DAYS = 24 * 60 * 60 * 1000;
const INVITE_TTL_DAYS = 30;
const IMPERSONATION_LOG_TTL_DAYS = 365;
const LOGIN_EVENT_TTL_DAYS = 90;
const USER_CHANGE_LOG_TTL_DAYS = 365;

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);

  const now = Date.now();
  const inviteCutoff = new Date(now - INVITE_TTL_DAYS * DAYS);
  const logCutoff = new Date(now - IMPERSONATION_LOG_TTL_DAYS * DAYS);
  const loginEventCutoff = new Date(now - LOGIN_EVENT_TTL_DAYS * DAYS);
  const changeLogCutoff = new Date(now - USER_CHANGE_LOG_TTL_DAYS * DAYS);

  const [invites, logs, loginEvents, changeLogs, relatos, avisos] = await Promise.all([
    prisma.consultantInvite.deleteMany({
      where: { status: 'pending', createdAt: { lt: inviteCutoff } },
    }),
    prisma.consultantImpersonationLog.deleteMany({
      where: { createdAt: { lt: logCutoff } },
    }),
    prisma.loginEvent.deleteMany({
      where: { createdAt: { lt: loginEventCutoff } },
    }),
    prisma.userChangeLog.deleteMany({
      where: { createdAt: { lt: changeLogCutoff } },
    }),
    anonimizarReportesRetencao(prisma, new Date(now)),
    apagarAvisosVencidos(prisma, new Date(now)),
  ]);

  logger.info(
    `[lgpd-retention] convites pendentes purgados: ${invites.count}, logs de impersonation purgados: ${logs.count}, eventos de login purgados: ${loginEvents.count}, histórico de alterações purgado: ${changeLogs.count}, relatos da Análise de Ativos anonimizados: ${relatos.anonimizados}, avisos das listas purgados: ${avisos.notificacoes} (envios: ${avisos.envios})`,
  );

  return NextResponse.json({
    invitesPurged: invites.count,
    impersonationLogsPurged: logs.count,
    loginEventsPurged: loginEvents.count,
    changeLogsPurged: changeLogs.count,
    analiseRelatosAnonimizados: relatos.anonimizados,
    analiseAvisosPurgados: avisos.notificacoes,
    analiseEnviosPurgados: avisos.envios,
    cutoffs: {
      pendingInvites: inviteCutoff.toISOString(),
      impersonationLogs: logCutoff.toISOString(),
      loginEvents: loginEventCutoff.toISOString(),
      changeLogs: changeLogCutoff.toISOString(),
      analiseRelatos: relatos.corte.toISOString(),
      analiseAvisos: avisos.corte.toISOString(),
    },
  });
});
