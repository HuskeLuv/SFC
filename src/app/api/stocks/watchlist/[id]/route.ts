import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

// DELETE - Remover ativo do watchlist
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: stockId } = await params;
    const payload = requireAuth(request);

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
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
    
  } catch (error) {
    if (error instanceof Error && error.message === 'Não autorizado') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    console.error('Erro ao remover do watchlist:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 