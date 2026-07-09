/**
 * F3.2 — Planejamento Sonhos: remove uma entry específica de um objetivo.
 *
 * DELETE /api/planejamento-sonhos/:id/entries/:month
 *
 * Pre-checa ownership do objetivo (404 se não pertence ao user) antes de tocar
 * em entries — evita vazar existência de objetivos de outros users.
 *
 * Pós-delete: re-deriva status do objetivo via deriveStatusAfterEntryDelete.
 * Sem isso o status "Concluído" promovido por autoStatusOnEntry da entry
 * recém-deletada fica stale (mesmo padrão D do postmortem v2).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import {
  deriveStatusAfterEntryDelete,
  type Status,
} from '@/services/planejamento/planejamentoSonhos';
import { syncObjetivoRecordToCashflow } from '@/services/planejamento/sonhoCashflowSync';
import { recordChange } from '@/services/changeHistory';
import { decimalToNumber } from '../../../_lib/serializer';

const yearMonthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

export const DELETE = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string; month: string }> }) => {
    const auth = await requireAuthWithActing(request);
    const { targetUserId } = auth;
    const { id: objetivoId, month } = await params;

    if (!yearMonthRegex.test(month)) {
      return NextResponse.json({ error: 'month deve ser YYYY-MM' }, { status: 400 });
    }

    const objetivo = await prisma.planejamentoObjetivo.findFirst({
      where: { id: objetivoId, userId: targetUserId },
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

    const remaining = await prisma.planejamentoObjetivoEntry.findMany({
      where: { objetivoId },
      select: { month: true, balance: true },
    });
    const target = decimalToNumber(objetivo.target);
    const remainingNumeric = remaining.map((e) => ({
      month: e.month,
      balance: decimalToNumber(e.balance),
    }));
    const nextStatus = deriveStatusAfterEntryDelete(
      objetivo.status as Status,
      remainingNumeric,
      target,
    );
    if (nextStatus !== objetivo.status) {
      await prisma.planejamentoObjetivo.update({
        where: { id: objetivoId },
        data: { status: nextStatus },
      });
      // Status mudou (ex.: "Concluído" → "Em espera" sem entries) — a projeção
      // da linha-espelho no fluxo de caixa depende do status; re-sincroniza.
      await syncObjetivoRecordToCashflow(targetUserId, { ...objetivo, status: nextStatus });
    }

    await recordChange({
      request,
      auth,
      section: 'planejamento',
      action: 'sonho-aporte.excluir',
      entity: 'sonho',
      entityId: objetivoId,
      entityLabel: objetivo.name,
    });

    return NextResponse.json({ success: true });
  },
);
