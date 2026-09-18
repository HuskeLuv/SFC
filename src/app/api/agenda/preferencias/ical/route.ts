/**
 * Token do feed iCal da Agenda.
 *
 * POST   /api/agenda/preferencias/ical → gera (ou REGERA) o token e devolve a URL
 * DELETE /api/agenda/preferencias/ical → revoga: o link para de funcionar na hora
 *
 * Regerar invalida o link antigo — é o botão de pânico de quem compartilhou o
 * endereço sem querer. Consultor agindo pelo cliente não mexe nisso.
 */
import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';

/** 32 bytes = 256 bits de entropia; a URL é pública, então não economiza. */
function novoToken(): string {
  return randomBytes(32).toString('base64url');
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  if (auth.actingClient) {
    throw new ApiError(403, 'Consultor não gera o link da agenda do cliente.');
  }

  const icalToken = novoToken();
  const pref = await prisma.agendaPreferencia.upsert({
    where: { userId: auth.targetUserId },
    create: { userId: auth.targetUserId, icalToken, icalCriadoEm: new Date() },
    update: { icalToken, icalCriadoEm: new Date() },
    select: { icalToken: true, icalCriadoEm: true },
  });

  return NextResponse.json({
    icalToken: pref.icalToken,
    icalCriadoEm: pref.icalCriadoEm?.toISOString() ?? null,
  });
});

export const DELETE = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  if (auth.actingClient) {
    throw new ApiError(403, 'Consultor não revoga o link da agenda do cliente.');
  }

  await prisma.agendaPreferencia.updateMany({
    where: { userId: auth.targetUserId },
    data: { icalToken: null, icalCriadoEm: null },
  });
  return NextResponse.json({ ok: true });
});
