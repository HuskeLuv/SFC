/**
 * Seguros / Gestão de Risco (coleção).
 *
 * GET   /api/saude-financeira/seguros   → lista apólices do user
 * POST  /api/saude-financeira/seguros   → cadastra apólice
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { seguroCreateSchema, validationError } from '@/utils/validation-schemas';
import { recordChange, diffFields, SEGURO_FIELD_LABELS } from '@/services/changeHistory';
import { serializeSeguro } from './_lib/serializer';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const rows = await prisma.seguroApolice.findMany({
    where: { userId: targetUserId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ seguros: rows.map(serializeSeguro) });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { targetUserId } = auth;

  const parsed = seguroCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationError(parsed);
  }

  const s = parsed.data;
  const created = await prisma.seguroApolice.create({
    data: {
      userId: targetUserId,
      nome: s.nome,
      tipo: s.tipo,
      cobertura: s.cobertura,
      risco: s.risco,
      custoAnual: s.custoAnual,
      capitalSegurado: s.capitalSegurado ?? null,
      notes: s.notes ?? null,
    },
  });

  await recordChange({
    request,
    auth,
    section: 'saude-financeira',
    action: 'seguro.criar',
    entity: 'seguro',
    entityId: created.id,
    entityLabel: created.nome,
    changes: diffFields({}, serializeSeguro(created), SEGURO_FIELD_LABELS),
  });

  return NextResponse.json({ seguro: serializeSeguro(created) }, { status: 201 });
});
