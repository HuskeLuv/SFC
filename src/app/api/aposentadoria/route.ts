/**
 * Simulador de Aposentadoria — plano (singleton por usuário).
 *
 * GET /api/aposentadoria  → plano do user (com entries) ou { plano: null }
 * PUT /api/aposentadoria  → upsert dos parâmetros do plano (perfil, taxas,
 *                           acumulação, renda, eventos, início do tracking)
 *
 * Há no máximo um plano por usuário (unique em userId). O upsert preserva os
 * entries de acompanhamento já registrados — só atualiza os parâmetros.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { aposentadoriaPlanoUpsertSchema, validationError } from '@/utils/validation-schemas';
import { recordChange } from '@/services/changeHistory';
import { serializePlano } from './_lib/serializer';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const plano = await prisma.aposentadoriaPlano.findUnique({
    where: { userId: targetUserId },
    include: { entries: true },
  });

  return NextResponse.json({ plano: plano ? serializePlano(plano) : null });
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { targetUserId } = auth;

  const body = await request.json();
  const parsed = aposentadoriaPlanoUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }

  const d = parsed.data;
  // eventos/fieldLocks são Json no Prisma; os arrays tipados serializam direto.
  const eventos = d.eventos as unknown as Prisma.InputJsonValue;
  const fieldLocks = d.fieldLocks as unknown as Prisma.InputJsonValue;
  const data = {
    idade: d.idade,
    apos: d.apos,
    vida: d.vida,
    rentNom: d.rentNom,
    inflacao: d.inflacao,
    rentNomRetiro: d.rentNomRetiro ?? null,
    patrimonio: d.patrimonio,
    aporteM: d.aporteM,
    renda: d.renda,
    trackStartMonth: d.trackStartMonth,
    trackStartYear: d.trackStartYear,
    eventos,
    fieldLocks,
  };

  const plano = await prisma.aposentadoriaPlano.upsert({
    where: { userId: targetUserId },
    create: { userId: targetUserId, ...data },
    update: data,
    include: { entries: true },
  });

  // Upsert sem before-state carregado → registra a ação sem diff de campos.
  await recordChange({
    request,
    auth,
    section: 'planejamento',
    action: 'aposentadoria.editar',
    entity: 'aposentadoria',
    entityId: plano.id,
  });

  return NextResponse.json({ plano: serializePlano(plano) });
});
