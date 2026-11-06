import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { relatorioFinanceiroHabilitado } from '@/lib/relatorioFinanceiroConfig';
import { avisarSeOverrideForaDoLocal, planoDoUsuario } from '@/services/planos/resolverPlano';
import { montarRelatorioFinanceiro } from '@/services/relatorios/financeiro/montarRelatorio';
import { MESES_RELATORIO, type MesesRelatorio } from '@/types/relatorioFinanceiro';

/**
 * GET /api/relatorios/financeiro?meses=1|3|6|12 — Relatório financeiro (contrato versão 1).
 *
 * Só leitura. O plano é o do dono dos dados (targetUserId, também com consultor) e os blocos que
 * ele não libera vêm null. Com a chave RELATORIO_FINANCEIRO_HABILITADO desligada: 404.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  meses: z
    .enum(MESES_RELATORIO.map(String) as [string, ...string[]])
    .default('1')
    .transform((v) => Number(v) as MesesRelatorio),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const parsed = querySchema.safeParse({
    meses: request.nextUrl.searchParams.get('meses') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Período inválido: use meses=1, 3, 6 ou 12' },
      { status: 400 },
    );
  }
  const { meses } = parsed.data;

  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/relatorios/financeiro',
    'GET',
  );

  if (!relatorioFinanceiroHabilitado()) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  avisarSeOverrideForaDoLocal();
  const plano = await planoDoUsuario(targetUserId);

  const [dono, consultorRow] = await Promise.all([
    actingClient
      ? Promise.resolve(null)
      : prisma.user.findUnique({ where: { id: targetUserId }, select: { name: true } }),
    actingClient
      ? prisma.user.findUnique({ where: { id: payload.id }, select: { name: true, email: true } })
      : Promise.resolve(null),
  ]);
  const cliente = actingClient?.name ?? dono?.name ?? 'Cliente';
  const consultor = actingClient
    ? (consultorRow?.name ?? consultorRow?.email ?? 'Consultor')
    : null;

  const relatorio = await montarRelatorioFinanceiro({
    userId: targetUserId,
    meses,
    plano,
    cliente,
    consultor,
    agora: new Date(),
  });

  return NextResponse.json(relatorio, { headers: { 'Cache-Control': 'no-store' } });
});
