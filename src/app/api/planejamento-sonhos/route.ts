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
import { provisionDefaultSonhos } from '@/services/planejamento/sonhosDefaults';
import { syncObjetivoToCashflow } from '@/services/planejamento/sonhoCashflowSync';
import { recordChange, diffFields, SONHO_FIELD_LABELS } from '@/services/changeHistory';
import { serializeObjetivo } from './_lib/serializer';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  // 1º acesso: provisiona os 6 sonhos padrão + linhas espelho no fluxo de caixa
  // (idempotente — só roda uma vez por usuário).
  await provisionDefaultSonhos(targetUserId);

  const rows = await prisma.planejamentoObjetivo.findMany({
    where: { userId: targetUserId },
    include: { entries: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ objetivos: rows.map(serializeObjetivo) });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { targetUserId } = auth;

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

  // Espelha o sonho no fluxo de caixa (linha em "Planejamento Financeiro").
  await syncObjetivoToCashflow(targetUserId, {
    id: created.id,
    name,
    target,
    available,
    months,
    rate,
    startDate: created.startDate,
    status: created.status,
  });

  await recordChange({
    request,
    auth,
    section: 'planejamento',
    action: 'sonho.criar',
    entity: 'sonho',
    entityId: created.id,
    entityLabel: name,
    changes: diffFields({}, created, SONHO_FIELD_LABELS),
  });

  return NextResponse.json({ objetivo: serializeObjetivo(created) }, { status: 201 });
});
