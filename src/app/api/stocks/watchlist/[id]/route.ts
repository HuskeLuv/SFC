import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';

// DELETE - Remover ativo do watchlist
export const DELETE = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id: stockId } = await params;
    const { targetUserId } = await requireAuthWithActing(request);

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Verificar se o item existe no watchlist do usuário
    const watchlistItem = await prisma.watchlist.findUnique({
      where: {
        userId_stockId: {
          userId: user.id,
          stockId: stockId,
        },
      },
    });

    if (!watchlistItem) {
      return NextResponse.json({ error: 'Item não encontrado no watchlist' }, { status: 404 });
    }

    // Remover do watchlist
    await prisma.watchlist.delete({
      where: {
        userId_stockId: {
          userId: user.id,
          stockId: stockId,
        },
      },
    });

    return NextResponse.json({ message: 'Item removido do watchlist com sucesso' });
  },
);
