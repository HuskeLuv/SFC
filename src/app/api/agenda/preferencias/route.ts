/**
 * Preferências da Agenda do usuário.
 *
 * GET   /api/agenda/preferencias → { lembretes, icalToken, icalCriadoEm }
 * PATCH /api/agenda/preferencias → liga/desliga os lembretes
 * (o token do feed iCal é gerado e revogado em ./ical)
 *
 * Sem registro no banco vale o padrão (ligado); o PATCH cria a linha na
 * primeira mudança. Consultor agindo pelo cliente só lê — preferência é do
 * dono da conta.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';

const patchSchema = z.object({ lembretes: z.boolean() });

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const pref = await prisma.agendaPreferencia.findUnique({
    where: { userId: targetUserId },
    select: { lembretes: true, icalToken: true, icalCriadoEm: true },
  });
  return NextResponse.json({
    lembretes: pref?.lembretes ?? true,
    // O token só sai para o dono da conta, que é quem vai copiar o link.
    icalToken: pref?.icalToken ?? null,
    icalCriadoEm: pref?.icalCriadoEm?.toISOString() ?? null,
  });
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  if (auth.actingClient) {
    throw new ApiError(403, 'Consultor não altera as preferências do cliente.');
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);

  const pref = await prisma.agendaPreferencia.upsert({
    where: { userId: auth.targetUserId },
    create: { userId: auth.targetUserId, lembretes: parsed.data.lembretes },
    update: { lembretes: parsed.data.lembretes },
    select: { lembretes: true },
  });
  return NextResponse.json(pref);
});
