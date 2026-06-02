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
import { serializePlano } from '../_lib/serializer';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

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

  await prisma.aposentadoriaPlanoEntry.upsert({
    where: { planoId_off: { planoId: plano.id, off } },
    create: { planoId: plano.id, off, year, month, aporteReal, patFinal },
    update: { year, month, aporteReal, patFinal },
  });

  const updated = await prisma.aposentadoriaPlano.findUniqueOrThrow({
    where: { id: plano.id },
    include: { entries: true },
  });

  return NextResponse.json({ plano: serializePlano(updated) }, { status: 201 });
});
