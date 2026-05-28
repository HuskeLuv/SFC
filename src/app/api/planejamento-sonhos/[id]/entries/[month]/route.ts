/**
 * F3.2 — Planejamento Sonhos: remove uma entry específica de um objetivo.
 *
 * DELETE /api/planejamento-sonhos/:id/entries/:month
 *
 * Pre-checa ownership do objetivo (404 se não pertence ao user) antes de tocar
 * em entries — evita vazar existência de objetivos de outros users.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';

const yearMonthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

export const DELETE = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string; month: string }> }) => {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id: objetivoId, month } = await params;

    if (!yearMonthRegex.test(month)) {
      return NextResponse.json({ error: 'month deve ser YYYY-MM' }, { status: 400 });
    }

    const objetivo = await prisma.planejamentoObjetivo.findFirst({
      where: { id: objetivoId, userId: targetUserId },
      select: { id: true },
    });
    if (!objetivo) {
      return NextResponse.json({ error: 'Objetivo não encontrado' }, { status: 404 });
    }

    const deleted = await prisma.planejamentoObjetivoEntry.deleteMany({
      where: { objetivoId, month },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Entry não encontrada' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  },
);
