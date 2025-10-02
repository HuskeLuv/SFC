import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '20');

    let emissores;

    if (search) {
      emissores = await prisma.emissor.findMany({
        where: {
          AND: [
            { status: 'ATIVO' },
            {
              OR: [
                { nome: { contains: search, mode: 'insensitive' } },
                { tipo: { contains: search, mode: 'insensitive' } },
              ],
            },
          ],
        },
        take: limit,
        orderBy: { nome: 'asc' },
      });
    } else {
      emissores = await prisma.emissor.findMany({
        where: { status: 'ATIVO' },
        take: limit,
        orderBy: { nome: 'asc' },
      });
    }

    return NextResponse.json({
      success: true,
      emissores: emissores.map(emissor => ({
        id: emissor.id,
        nome: emissor.nome,
        tipo: emissor.tipo,
        status: emissor.status,
      })),
      count: emissores.length,
    });

  } catch (error) {
    console.error('Erro ao buscar emissores:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido'
      },
      { status: 500 }
    );
  }
}
