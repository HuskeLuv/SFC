/**
 * F3.2 — Planejamento Sonhos (coleção).
 *
 * GET   /api/planejamento-sonhos          → lista objetivos do user (com entries)
 * POST  /api/planejamento-sonhos          → cria objetivo (auto-categoriza por months)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { planejamentoObjetivoCreateSchema, validationError } from '@/utils/validation-schemas';
import { categoryFromMonths } from '@/services/planejamento/planejamentoSonhos';
import { serializeObjetivo } from './_lib/serializer';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const rows = await prisma.planejamentoObjetivo.findMany({
    where: { userId: targetUserId },
    include: { entries: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ objetivos: rows.map(serializeObjetivo) });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const body = await request.json();
  const parsed = planejamentoObjetivoCreateSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }

  const { name, target, months, startDate, available, rate, priority, category, status, notes } =
    parsed.data;

  // Auto-categoriza pelo prazo se o caller não enviou category.
  const finalCategory = category ?? categoryFromMonths(months);

  const created = await prisma.planejamentoObjetivo.create({
    data: {
      userId: targetUserId,
      name,
      target,
      months,
      startDate: startDate ?? null,
      available,
      rate,
      priority,
      category: finalCategory,
      status,
      notes: notes ?? null,
    },
    include: { entries: true },
  });

  return NextResponse.json({ objetivo: serializeObjetivo(created) }, { status: 201 });
});
