import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const tipo = searchParams.get('tipo') || '';
    const limit = parseInt(searchParams.get('limit') || '20');

    // Para ações, buscar na tabela Stock
    if (tipo === 'acao') {
      const whereClause: Record<string, unknown> = {
        isActive: true,
      };

      if (search) {
        whereClause.OR = [
          { ticker: { contains: search, mode: 'insensitive' } },
          { companyName: { contains: search, mode: 'insensitive' } },
        ];
      }

      const stocks = await prisma.stock.findMany({
        where: whereClause,
        take: limit,
        orderBy: [
          { ticker: 'asc' },
        ],
      });

      return NextResponse.json({
        success: true,
        assets: stocks.map(stock => ({
          id: stock.id,
          symbol: stock.ticker,
          name: stock.companyName,
          type: 'stock',
          currency: 'BRL',
          source: 'brapi',
        })),
        count: stocks.length,
      });
    }

    // Para outros tipos, buscar na tabela Asset
    const baseFilters: Record<string, unknown> = {};

    if (tipo) {
      const tipoMapping: Record<string, string[]> = {
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
        baseFilters.type = tipoFilter.length === 1 ? tipoFilter[0] : { in: tipoFilter };
      }
    }

    // Construir whereClause combinando filtros base com busca de texto
    let whereClause: Record<string, unknown>;

    if (search) {
      // Quando há busca, usar AND para combinar filtros base com OR de busca
      const andConditions = [];
      
      // Adicionar filtros base apenas se existirem
      if (Object.keys(baseFilters).length > 0) {
        andConditions.push(baseFilters);
      }
      
      // Adicionar condição de busca
      andConditions.push({
        OR: [
          { symbol: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ],
      });
      
      whereClause = {
        AND: andConditions,
      };
    } else {
      // Quando não há busca, usar filtros base diretamente
      whereClause = Object.keys(baseFilters).length > 0 ? baseFilters : {};
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