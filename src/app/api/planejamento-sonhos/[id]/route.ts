/**
 * F3.2 — Planejamento Sonhos (recurso individual).
 *
 * GET    /api/planejamento-sonhos/:id   → detalhe (com entries)
 * PATCH  /api/planejamento-sonhos/:id   → edita campos parciais
 * DELETE /api/planejamento-sonhos/:id   → remove (cascade entries via FK)
 *
 * 404 sempre que o objetivo não pertence ao user — vale tanto pra "não existe"
 * quanto pra "pertence a outro user", como blindagem.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { planejamentoObjetivoPatchSchema, validationError } from '@/utils/validation-schemas';
import { categoryFromMonths } from '@/services/planejamento/planejamentoSonhos';
import {
  syncObjetivoToCashflow,
  removeObjetivoCashflow,
} from '@/services/planejamento/sonhoCashflowSync';
import { decimalToNumber, serializeObjetivo } from '../_lib/serializer';

async function findOwned(id: string, userId: string) {
  return prisma.planejamentoObjetivo.findFirst({
    where: { id, userId },
    include: { entries: true },
  });
}

export const GET = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id } = await params;

    const objetivo = await findOwned(id, targetUserId);
    if (!objetivo) {
      return NextResponse.json({ error: 'Objetivo não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ objetivo: serializeObjetivo(objetivo) });
  },
);

export const PATCH = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id } = await params;

    const existing = await findOwned(id, targetUserId);
    if (!existing) {
      return NextResponse.json({ error: 'Objetivo não encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = planejamentoObjetivoPatchSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed);
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.target !== undefined) data.target = parsed.data.target;
    if (parsed.data.months !== undefined) data.months = parsed.data.months;
    if (parsed.data.startDate !== undefined) data.startDate = parsed.data.startDate ?? null;
    if (parsed.data.available !== undefined) data.available = parsed.data.available;
    if (parsed.data.rate !== undefined) data.rate = parsed.data.rate;
    if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
    if (parsed.data.status !== undefined) data.status = parsed.data.status;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes ?? null;

    // Se months mudou e o caller não passou category explícita, reaplica
    // a regra <=12c/<=60m/>60l. Se category veio no body, respeita ela.
    if (parsed.data.category !== undefined) {
      data.category = parsed.data.category;
    } else if (parsed.data.months !== undefined) {
      data.category = categoryFromMonths(parsed.data.months);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    const updated = await prisma.planejamentoObjetivo.update({
      where: { id },
      data,
      include: { entries: true },
    });

    // Re-sincroniza a linha espelho no fluxo de caixa com o aporte recalculado.
    await syncObjetivoToCashflow(targetUserId, {
      id: updated.id,
      name: updated.name,
      target: decimalToNumber(updated.target),
      available: decimalToNumber(updated.available),
      months: updated.months,
      rate: decimalToNumber(updated.rate),
    });

    return NextResponse.json({ objetivo: serializeObjetivo(updated) });
  },
);

export const DELETE = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id } = await params;

    const existing = await prisma.planejamentoObjetivo.findFirst({
      where: { id, userId: targetUserId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Objetivo não encontrado' }, { status: 404 });
    }

    // Remove a linha espelho no fluxo de caixa antes (o FK é SetNull, então
    // sem isso a linha ficaria órfã com os valores antigos).
    await removeObjetivoCashflow(id);
    // Cascade via FK onDelete:Cascade no schema → entries somem juntas.
    await prisma.planejamentoObjetivo.delete({ where: { id } });

    return NextResponse.json({ success: true });
  },
);
