import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { listarReserva } from '@/app/api/carteira/_lib/listarReserva';

import { withErrorHandler } from '@/utils/apiErrorHandler';

// Seleção, valoração e metadados em listarReserva (o mesmo miolo das duas
// reservas). Com MOVER_CAIXA_RF_HABILITADO a aba segue o mover da fase 2.
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);

  // Registrar acesso se estiver personificado
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/carteira/reserva-oportunidade',
    'GET',
  );

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  return NextResponse.json(await listarReserva(targetUserId, 'reservaOportunidade'));
});
