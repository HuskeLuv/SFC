/**
 * Agenda (página Calendário).
 *
 * GET  /api/calendar?de=AAAA-MM-DD&ate=AAAA-MM-DD[&tipos=manual,divida] → { eventos, periodo, fontesComErro }
 *      Eventos do período vindos de todas as fontes (manual + calculadas),
 *      já ordenados. Sem parâmetros = mês atual. Consultor agindo por um
 *      cliente enxerga a agenda do cliente (auditoria 29/08/2026).
 * POST /api/calendar → cria um evento manual (consultor não cria).
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { eventoCreateSchema, validationError } from '@/utils/validation-schemas';
import { recordChange, diffFields, EVENTO_FIELD_LABELS } from '@/services/changeHistory';
import { montarAgenda, parsePeriodo, parseTipos } from '@/services/calendario/agenda';
import { camposDoEvento, paraPrisma, serializarEvento } from '@/services/calendario/eventoManual';
import { deDataCivil } from '@/services/calendario/datas';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const periodo = parsePeriodo(request.nextUrl.searchParams);
  const tipos = parseTipos(request.nextUrl.searchParams);
  const { eventos, fontesComErro } = await montarAgenda(targetUserId, periodo, tipos);
  return NextResponse.json({ eventos, periodo, fontesComErro });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  if (auth.actingClient) {
    throw new ApiError(403, 'Consultor não cria eventos na agenda do cliente.');
  }
  const parsed = eventoCreateSchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);

  const d = parsed.data;
  const created = await prisma.event.create({
    data: {
      userId: auth.targetUserId,
      title: d.titulo,
      date: deDataCivil(d.data),
      ...paraPrisma({
        descricao: d.descricao ?? null,
        dataFim: d.dataFim ?? null,
        hora: d.hora ?? null,
        categoria: d.categoria ?? 'pessoal',
        recorrencia: d.recorrencia ?? 'nenhuma',
        lembrete: d.lembrete ?? false,
      }),
    },
  });

  await recordChange({
    request,
    auth,
    section: 'calendario',
    action: 'evento.criar',
    entity: 'evento',
    entityId: created.id,
    entityLabel: created.title,
    changes: diffFields({}, { ...camposDoEvento(created) }, EVENTO_FIELD_LABELS),
  });

  return NextResponse.json({ evento: serializarEvento(created) }, { status: 201 });
});
