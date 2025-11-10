import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const tipo = searchParams.get('tipo') || '';
    const limit = parseInt(searchParams.get('limit') || '20');

    const whereClause: Record<string, unknown> = {};

    // Filtrar por tipo se especificado
    if (tipo) {
      const tipoMapping: Record<string, string[]> = {
        'acao': ['stock'],
        'bdr': ['brd', 'bdr'],
        'fii': ['fund', 'fii'],
        'etf': ['etf'],
        'reit': ['reit'],
        'debenture': ['bond'],
        'fundo': ['fund', 'funds'],
        'tesouro-direto': ['bond'],
        'renda-fixa-prefixada': ['bond'],
        'renda-fixa-posfixada': ['bond'],
        'previdencia': ['insurance'],
        'criptoativo': ['crypto'],
        'moeda': ['currency'],
        'personalizado': ['custom'],
        'conta-corrente': ['cash'],
        'poupanca': ['cash'],
      };

      const tipoFilter = tipoMapping[tipo];
      if (tipoFilter && tipoFilter.length > 0) {
        whereClause.type = tipoFilter.length === 1 ? tipoFilter[0] : { in: tipoFilter };
      }
    }

    // Buscar por texto se especificado
    if (search) {
      whereClause.OR = [
        { symbol: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const assets = await prisma.asset.findMany({
      where: whereClause,
      take: limit,
      orderBy: [
        { symbol: 'asc' },
        { name: 'asc' }
      ],
    });

    return NextResponse.json({
      success: true,
      assets: assets.map(asset => ({
        id: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        type: asset.type,
        currency: asset.currency,
        source: asset.source,
      })),
      count: assets.length,
    });

  } catch (error) {
    console.error('Erro ao buscar ativos:', error);
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