import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Verificar autenticação
    const payload = requireAuth(request);

    // Buscar todos os ativos ativos
    const stocks = await prisma.stock.findMany({
      where: { isActive: true },
      orderBy: { ticker: 'asc' },
    });

    return NextResponse.json(stocks);
    
  } catch (error) {
    if (error instanceof Error && error.message === 'Não autorizado') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    console.error('Erro ao buscar ativos:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 