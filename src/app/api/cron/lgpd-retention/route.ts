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

const DAYS = 24 * 60 * 60 * 1000;
const INVITE_TTL_DAYS = 30;
const IMPERSONATION_LOG_TTL_DAYS = 365;

export const GET = withErrorHandler(async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 503 });
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const now = Date.now();
  const inviteCutoff = new Date(now - INVITE_TTL_DAYS * DAYS);
  const logCutoff = new Date(now - IMPERSONATION_LOG_TTL_DAYS * DAYS);

  const [invites, logs] = await Promise.all([
    prisma.consultantInvite.deleteMany({
      where: { status: 'pending', createdAt: { lt: inviteCutoff } },
    }),
    prisma.consultantImpersonationLog.deleteMany({
      where: { createdAt: { lt: logCutoff } },
    }),
  ]);

  logger.info(
    `[lgpd-retention] convites pendentes purgados: ${invites.count}, logs de impersonation purgados: ${logs.count}`,
  );

  return NextResponse.json({
    invitesPurged: invites.count,
    impersonationLogsPurged: logs.count,
    cutoffs: {
      pendingInvites: inviteCutoff.toISOString(),
      impersonationLogs: logCutoff.toISOString(),
    },
  });
});
