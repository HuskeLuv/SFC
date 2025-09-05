import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    requireAuth(request); // Verificar autenticação mas não usar o payload
    
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const institutions = await prisma.institution.findMany({
      where: {
        status: 'ATIVA',
        OR: [
          { nome: { contains: search, mode: 'insensitive' } },
          { codigo: { contains: search, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        codigo: true,
        nome: true,
      },
      orderBy: { nome: 'asc' },
      skip: offset,
      take: limit,
    });

    const total = await prisma.institution.count({
      where: {
        status: 'ATIVA',
        OR: [
          { nome: { contains: search, mode: 'insensitive' } },
          { codigo: { contains: search, mode: 'insensitive' } },
        ],
      },
    });

    return NextResponse.json({
      institutions: institutions.map(inst => ({
        value: inst.id,
        label: inst.nome,
        subtitle: inst.codigo,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
    
  } catch (error) {
    if (error instanceof Error && error.message === 'Não autorizado') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    console.error('Erro ao buscar instituições:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
