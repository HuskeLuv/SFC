/**
 * F3.2 — Planejamento Sonhos: entries (registro mensal de progresso).
 *
 * POST /api/planejamento-sonhos/:id/entries
 *   Body: { month: YYYY-MM, aporte, balance }
 *   Usa upsert por (objetivoId, month) — chave única no schema.
 *   Aplica `autoStatusOnEntry` no objetivo:
 *     - "Em espera" → "Iniciado" no primeiro entry
 *     - balance >= target → "Concluído"
 *
 * Em uma única transação pra garantir consistência: nenhum entry sem status
 * atualizado e nenhum status atualizado sem entry persistida.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { planejamentoEntryUpsertSchema, validationError } from '@/utils/validation-schemas';
import { autoStatusOnEntry, type Status } from '@/services/planejamento/planejamentoSonhos';
import { syncObjetivoRecordToCashflow } from '@/services/planejamento/sonhoCashflowSync';
import { recordChange, diffFields, SONHO_ENTRY_FIELD_LABELS } from '@/services/changeHistory';
import { decimalToNumber, serializeObjetivo } from '../../_lib/serializer';

export const POST = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await requireAuthWithActing(request);
    const { targetUserId } = auth;
    const { id: objetivoId } = await params;

    const objetivo = await prisma.planejamentoObjetivo.findFirst({
      where: { id: objetivoId, userId: targetUserId },
    });
    if (!objetivo) {
      return NextResponse.json({ error: 'Objetivo não encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = planejamentoEntryUpsertSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed);
    }

    const { month, aporte, balance } = parsed.data;

    const target = decimalToNumber(objetivo.target);
    const nextStatus = autoStatusOnEntry(objetivo.status as Status, balance, target);

    // Entry anterior (o upsert pode sobrescrever) + status prévio: alimentam
    // o snapshot que permite desfazer o registro do mês.
    const prevEntry = await prisma.planejamentoObjetivoEntry.findUnique({
      where: { objetivoId_month: { objetivoId, month } },
    });

    const [, , updatedObjetivo] = await prisma.$transaction([
      prisma.planejamentoObjetivoEntry.upsert({
        where: { objetivoId_month: { objetivoId, month } },
        // Registro manual sempre vence o auto-derivado das células verdes.
        create: { objetivoId, month, aporte, balance, source: 'manual' },
        update: { aporte, balance, source: 'manual' },
      }),
      prisma.planejamentoObjetivo.update({
        where: { id: objetivoId },
        data: nextStatus !== objetivo.status ? { status: nextStatus } : {},
      }),
      prisma.planejamentoObjetivo.findUniqueOrThrow({
        where: { id: objetivoId },
        include: { entries: true },
      }),
    ]);

    // Transição automática de status (ex.: "Em espera" → "Iniciado" no 1º
    // lançamento) muda se o sonho projeta no fluxo de caixa — re-sincroniza.
    if (updatedObjetivo.status !== objetivo.status) {
      await syncObjetivoRecordToCashflow(targetUserId, updatedObjetivo);
    }

    await recordChange({
      request,
      auth,
      section: 'planejamento',
      action: 'sonho-aporte.registrar',
      entity: 'sonho',
      entityId: objetivoId,
      entityLabel: `${objetivo.name} · ${month}`,
      changes: diffFields(
        {
          aporte: prevEntry ? decimalToNumber(prevEntry.aporte) : null,
          balance: prevEntry ? decimalToNumber(prevEntry.balance) : null,
        },
        { aporte, balance },
        SONHO_ENTRY_FIELD_LABELS,
      ),
      snapshot: {
        v: 1,
        kind: 'sonho-entry',
        data: {
          prevEntry: prevEntry
            ? {
                aporte: decimalToNumber(prevEntry.aporte),
                balance: decimalToNumber(prevEntry.balance),
                source: prevEntry.source,
              }
            : null,
        },
        meta: { month, prevStatus: objetivo.status },
      },
    });

    return NextResponse.json({ objetivo: serializeObjetivo(updatedObjetivo) }, { status: 201 });
  },
);
