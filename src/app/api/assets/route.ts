import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const tipo = searchParams.get('tipo') || '';
    const limit = parseInt(searchParams.get('limit') || '20');

    const whereClause: any = {};

    // Filtrar por tipo se especificado
    if (tipo) {
      const tipoMapping: Record<string, string> = {
        'acao': 'stock',
        'bdr': 'stock',
        'fii': 'stock',
        'etf': 'stock',
        'reit': 'stock',
        'debenture': 'stock',
        'fundo': 'stock',
        'tesouro-direto': 'stock',
        'renda-fixa-prefixada': 'stock',
        'renda-fixa-posfixada': 'stock',
        'previdencia': 'stock',
        'criptoativo': 'crypto',
        'moeda': 'stock',
        'personalizado': 'stock',
        'conta-corrente': 'stock',
        'poupanca': 'stock',
      };
      
      const tipoFilter = tipoMapping[tipo];
      if (tipoFilter) {
        whereClause.type = tipoFilter;
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