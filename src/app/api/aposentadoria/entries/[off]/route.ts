/**
 * Simulador de Aposentadoria — remoção de um registro mensal.
 *
 * DELETE /api/aposentadoria/entries/:off
 *   Remove o entry do offset informado. Idempotente: 404 se o plano não
 *   existe; silenciosamente OK se o entry já não estava lá.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import {
  recordChange,
  finalStateChanges,
  APOSENTADORIA_ENTRY_FIELD_LABELS,
} from '@/services/changeHistory';
import { serializePlano } from '../../_lib/serializer';

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

export const DELETE = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ off: string }> }) => {
    const auth = await requireAuthWithActing(request);
    const { targetUserId } = auth;
    const { off: offRaw } = await params;
    const off = Number(offRaw);
    if (!Number.isInteger(off) || off < 1) {
      return NextResponse.json({ error: 'Offset inválido' }, { status: 400 });
    }

    const plano = await prisma.aposentadoriaPlano.findUnique({
      where: { userId: targetUserId },
      select: { id: true },
    });
    if (!plano) {
      return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 });
    }

    // Estado pré-exclusão: snapshot pra desfazer (recriar a entry).
    const entryBefore = await prisma.aposentadoriaPlanoEntry.findUnique({
      where: { planoId_off: { planoId: plano.id, off } },
    });

    const deleted = await prisma.aposentadoriaPlanoEntry.deleteMany({
      where: { planoId: plano.id, off },
    });

    // Idempotente: só registra no histórico quando algo foi de fato removido.
    if (deleted.count > 0 && entryBefore) {
      await recordChange({
        request,
        auth,
        section: 'planejamento',
        action: 'aposentadoria-aporte.excluir',
        entity: 'aposentadoria',
        entityId: plano.id,
        entityLabel: `${MESES_ABREV[entryBefore.month - 1]}/${entryBefore.year}`,
        changes: finalStateChanges(
          {
            aporteReal: Number(entryBefore.aporteReal),
            patFinal: Number(entryBefore.patFinal),
          },
          APOSENTADORIA_ENTRY_FIELD_LABELS,
        ),
        snapshot: {
          v: 1,
          kind: 'aposentadoria-entry-excluir',
          data: {
            off: entryBefore.off,
            year: entryBefore.year,
            month: entryBefore.month,
            aporteReal: Number(entryBefore.aporteReal),
            patFinal: Number(entryBefore.patFinal),
          },
        },
      });
    }

    const updated = await prisma.aposentadoriaPlano.findUniqueOrThrow({
      where: { id: plano.id },
      include: { entries: true },
    });

    return NextResponse.json({ plano: serializePlano(updated) });
  },
);
