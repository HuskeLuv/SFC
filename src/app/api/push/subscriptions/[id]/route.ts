/**
 * DELETE /api/push/subscriptions/[id] — remove um aparelho REMOTO da lista do
 * Perfil (PWA fase 5, decisão 3: a lista de aparelhos entra na v1 e é o
 * remédio para o logout que não cancela a assinatura).
 *
 * Só apaga assinatura do PRÓPRIO usuário da sessão (`requireSession`, nunca
 * o acting do consultor); id de outro dono responde 404 sem vazar existência.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/utils/auth';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';

export const DELETE = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const payload = await requireSession(request);
    const { id } = await params;

    const { count } = await prisma.pushSubscription.deleteMany({
      where: { id, userId: payload.id },
    });
    if (count === 0) throw new ApiError(404, 'Assinatura não encontrada');
    return new NextResponse(null, { status: 204 });
  },
);
