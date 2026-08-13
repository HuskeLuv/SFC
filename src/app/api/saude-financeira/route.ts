import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { buildSaudeFinanceira } from '@/services/saudeFinanceira/saudeFinanceiraServer';

/**
 * GET /api/saude-financeira — diagnóstico completo de saúde financeira.
 *
 * Read-only: deriva tudo de carteira + fluxo de caixa + dívidas + índices
 * (ver saudeFinanceiraServer.ts). Caso de uso original é o consultor
 * acompanhando o cliente, então o acesso personificado é logado.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);

  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/saude-financeira',
    'GET',
  );

  return NextResponse.json(await buildSaudeFinanceira(targetUserId));
});
