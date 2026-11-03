/**
 * Simulador de Aposentadoria — registro mensal de acompanhamento.
 *
 * POST /api/aposentadoria/entries
 *   Body: { off, aporteReal, patFinal }
 *   Upsert por (planoId, off). `year`/`month` são derivados de
 *   (trackStartMonth/trackStartYear + off) e desnormalizados pra exibição.
 *   Requer que o plano já exista (salve os parâmetros antes).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { aposentadoriaEntryUpsertSchema, validationError } from '@/utils/validation-schemas';
import { off2date } from '@/services/planejamento/aposentadoria';
import {
  recordChange,
  diffFields,
  APOSENTADORIA_ENTRY_FIELD_LABELS,
} from '@/services/changeHistory';
import { serializePlano } from '../_lib/serializer';
import { ORIGEM_AUTO, ORIGEM_MANUAL } from '@/services/planejamento/acompanhamentoAuto';

const MESES_ABREV = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { targetUserId } = auth;

  const plano = await prisma.aposentadoriaPlano.findUnique({
    where: { userId: targetUserId },
    select: { id: true, trackStartMonth: true, trackStartYear: true },
  });
  if (!plano) {
    return NextResponse.json(
      { error: 'Plano de aposentadoria não encontrado. Salve os parâmetros antes.' },
      { status: 404 },
    );
  }

  const body = await request.json();
  const parsed = aposentadoriaEntryUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }

  const { off, aporteReal, patFinal } = parsed.data;
  const { year, month } = off2date(plano, off);

  // Entry anterior (o upsert pode sobrescrever): snapshot pra desfazer.
  const prevEntry = await prisma.aposentadoriaPlanoEntry.findUnique({
    where: { planoId_off: { planoId: plano.id, off } },
  });

  // Digitado pelo cliente = 'manual' (o automático nunca mais sobrescreve).
  // Exceção: salvar um mês automático sem mudar os valores mantém 'auto'.
  const semMudanca =
    !!prevEntry &&
    Math.abs(Number(prevEntry.aporteReal) - aporteReal) < 0.005 &&
    Math.abs(Number(prevEntry.patFinal) - patFinal) < 0.005;
  const origem = prevEntry?.origem === ORIGEM_AUTO && semMudanca ? ORIGEM_AUTO : ORIGEM_MANUAL;

  await prisma.aposentadoriaPlanoEntry.upsert({
    where: { planoId_off: { planoId: plano.id, off } },
    create: { planoId: plano.id, off, year, month, aporteReal, patFinal, origem },
    update: { year, month, aporteReal, patFinal, origem },
  });

  await recordChange({
    request,
    auth,
    section: 'planejamento',
    action: 'aposentadoria-aporte.registrar',
    entity: 'aposentadoria',
    entityId: plano.id,
    entityLabel: `${MESES_ABREV[month - 1]}/${year}`,
    changes: diffFields(
      {
        aporteReal: prevEntry ? Number(prevEntry.aporteReal) : null,
        patFinal: prevEntry ? Number(prevEntry.patFinal) : null,
      },
      { aporteReal, patFinal },
      APOSENTADORIA_ENTRY_FIELD_LABELS,
    ),
    snapshot: {
      v: 1,
      kind: 'aposentadoria-entry',
      data: {
        prevEntry: prevEntry
          ? {
              aporteReal: Number(prevEntry.aporteReal),
              patFinal: Number(prevEntry.patFinal),
              origem: prevEntry.origem,
            }
          : null,
      },
      meta: { off },
    },
  });

  const updated = await prisma.aposentadoriaPlano.findUniqueOrThrow({
    where: { id: plano.id },
    include: { entries: true },
  });

  return NextResponse.json({ plano: serializePlano(updated) }, { status: 201 });
});
