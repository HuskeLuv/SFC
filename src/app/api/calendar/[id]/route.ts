/**
 * PATCH  /api/calendar/[id] → edita um evento manual (só campos enviados).
 * DELETE /api/calendar/[id] → exclui (snapshot 'evento' no histórico, desfazível).
 * Consultor agindo por cliente: só leitura (403 nas duas).
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { eventoUpdateSchema, validationError } from '@/utils/validation-schemas';
import {
  recordChange,
  diffFields,
  finalStateChanges,
  EVENTO_FIELD_LABELS,
} from '@/services/changeHistory';
import { camposDoEvento, paraPrisma, serializarEvento } from '@/services/calendario/eventoManual';

type Ctx = { params: Promise<{ id: string }> };

async function autorizar(request: NextRequest, id: string) {
  const auth = await requireAuthWithActing(request);
  if (auth.actingClient) {
    throw new ApiError(403, 'Consultor não altera eventos na agenda do cliente.');
  }
  const evento = await prisma.event.findFirst({ where: { id, userId: auth.targetUserId } });
  if (!evento) throw new ApiError(404, 'Evento não encontrado.');
  return { auth, evento };
}

export const PATCH = withErrorHandler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const { auth, evento } = await autorizar(request, id);
  const parsed = eventoUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);

  const antes = camposDoEvento(evento);
  const alvo = { ...antes, ...parsed.data };
  if (alvo.dataFim && alvo.dataFim < alvo.data) {
    throw new ApiError(400, 'A data final vem antes da inicial.');
  }
  const updated = await prisma.event.update({ where: { id }, data: paraPrisma(parsed.data) });
  const depois = camposDoEvento(updated);
  const changes = diffFields({ ...antes }, { ...depois }, EVENTO_FIELD_LABELS);
  if (changes.length > 0) {
    await recordChange({
      request,
      auth,
      section: 'calendario',
      action: 'evento.editar',
      entity: 'evento',
      entityId: id,
      entityLabel: updated.title,
      changes,
    });
  }
  return NextResponse.json({ evento: serializarEvento(updated) });
});

export const DELETE = withErrorHandler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const { auth, evento } = await autorizar(request, id);
  const campos = camposDoEvento(evento);
  await prisma.event.delete({ where: { id } });
  await recordChange({
    request,
    auth,
    section: 'calendario',
    action: 'evento.excluir',
    entity: 'evento',
    entityId: id,
    entityLabel: evento.title,
    changes: finalStateChanges({ ...campos }, EVENTO_FIELD_LABELS),
    snapshot: { v: 1, kind: 'evento', data: { id, ...campos } },
  });
  return NextResponse.json({ ok: true });
});
