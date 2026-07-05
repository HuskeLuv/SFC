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
import { recordChange } from '@/services/changeHistory';
import { serializePlano } from '../../_lib/serializer';

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

    const deleted = await prisma.aposentadoriaPlanoEntry.deleteMany({
      where: { planoId: plano.id, off },
    });

    // Idempotente: só registra no histórico quando algo foi de fato removido.
    if (deleted.count > 0) {
      await recordChange({
        request,
        auth,
        section: 'planejamento',
        action: 'aposentadoria-aporte.excluir',
        entity: 'aposentadoria',
        entityId: plano.id,
      });
    }

    const updated = await prisma.aposentadoriaPlano.findUniqueOrThrow({
      where: { id: plano.id },
      include: { entries: true },
    });

    return NextResponse.json({ plano: serializePlano(updated) });
  },
);
