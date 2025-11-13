import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

// GET - Buscar watchlist do usuário
export async function GET(request: NextRequest) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const watchlist = await prisma.watchlist.findMany({
      where: { userId: user.id },
      include: {
        stock: true,
      },
      orderBy: { addedAt: 'desc' },
    });

    return NextResponse.json(watchlist);
    
  } catch (error) {
    if (error instanceof Error && error.message === 'Não autorizado') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    console.error('Erro ao buscar watchlist:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// POST - Adicionar ativo ao watchlist
export async function POST(request: NextRequest) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const { stockId, notes } = await request.json();

    if (!stockId) {
      return NextResponse.json({ error: 'ID do ativo é obrigatório' }, { status: 400 });
    }

    // Verificar se o ativo existe
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
    });

    if (!stock) {
      return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 });
    }

    // Verificar se já está no watchlist
    const existingWatchlist = await prisma.watchlist.findUnique({
      where: {
        userId_stockId: {
          userId: user.id,
          stockId: stockId,
        },
      },
    });

    if (existingWatchlist) {
      return NextResponse.json({ error: 'Ativo já está no watchlist' }, { status: 400 });
    }

    // Adicionar ao watchlist
    const watchlistItem = await prisma.watchlist.create({
      data: {
        userId: user.id,
        stockId: stockId,
        notes: notes || null,
      },
      include: {
        stock: true,
      },
    });

    return NextResponse.json(watchlistItem, { status: 201 });
    
  } catch (error) {
    if (error instanceof Error && error.message === 'Não autorizado') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    console.error('Erro ao adicionar ao watchlist:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 