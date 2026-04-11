import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const tipo = searchParams.get('tipo') || '';
  const limit = parseInt(searchParams.get('limit') || '20');

  // Para Ações Brasil: combina ações (Stock) e BDRs (Asset) em uma única busca
  if (tipo === 'acoes-brasil') {
    const halfLimit = Math.ceil(limit / 2);
    const stockWhere: Record<string, unknown> = {
      isActive: true,
      NOT: { ticker: { endsWith: '11' } }, // Excluir FIIs
    };
    if (search) {
      stockWhere.OR = [
        { ticker: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [stocks, bdrAssets] = await Promise.all([
      prisma.stock.findMany({
        where: stockWhere,
        take: halfLimit,
        orderBy: [{ ticker: 'asc' }],
      }),
      prisma.asset.findMany({
        where: {
          type: { in: ['brd', 'bdr'] },
          ...(search && {
            OR: [
              { symbol: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }),
        },
        take: halfLimit,
        orderBy: [{ symbol: 'asc' }],
      }),
    ]);
    const acaoItems = stocks.map((stock) => ({
      id: `acao:${stock.id}`,
      symbol: stock.ticker,
      name: stock.companyName,
      type: 'acao',
      currency: 'BRL',
      source: 'brapi',
    }));
    const bdrItems = bdrAssets.map((asset) => ({
      id: `bdr:${asset.id}`,
      symbol: asset.symbol,
      name: asset.name,
      type: 'bdr',
      currency: asset.currency || 'BRL',
      source: asset.source || 'manual',
    }));
    return NextResponse.json({
      success: true,
      assets: [...acaoItems, ...bdrItems],
      count: acaoItems.length + bdrItems.length,
    });
  }

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
      orderBy: [{ ticker: 'asc' }],
    });

    return NextResponse.json({
      success: true,
      assets: stocks.map((stock) => ({
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

  // Para FIIs, também buscar na tabela Stock (mesma tabela das ações)
  // FIIs são identificados por tickers que terminam em '11' ou nomes que contêm "fundo imobiliário" ou "fii"
  if (tipo === 'fii') {
    const whereClause: Record<string, unknown> = {
      isActive: true,
      OR: [
        { ticker: { endsWith: '11' } },
        { companyName: { contains: 'fundo imobiliário', mode: 'insensitive' } },
        { companyName: { contains: 'fii', mode: 'insensitive' } },
      ],
    };

    if (search) {
      // Adicionar condições de busca combinadas com o filtro de FII
      const searchConditions = [
        { ticker: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
      ];

      whereClause.AND = [
        {
          OR: [
            { ticker: { endsWith: '11' } },
            { companyName: { contains: 'fundo imobiliário', mode: 'insensitive' } },
            { companyName: { contains: 'fii', mode: 'insensitive' } },
          ],
        },
        {
          OR: searchConditions,
        },
      ];
      delete whereClause.OR;
    }

    const stocks = await prisma.stock.findMany({
      where: whereClause,
      take: limit,
      orderBy: [{ ticker: 'asc' }],
    });

    return NextResponse.json({
      success: true,
      assets: stocks.map((stock) => ({
        id: stock.id,
        symbol: stock.ticker,
        name: stock.companyName,
        type: 'fii',
        currency: 'BRL',
        source: 'brapi',
      })),
      count: stocks.length,
    });
  }

  // Para stocks e previdência: adicionados manualmente
  if (tipo === 'stock' || tipo === 'previdencia') {
    return NextResponse.json({
      success: true,
      assets: [],
      count: 0,
    });
  }

  // Para outros tipos, buscar na tabela Asset
  const baseFilters: Record<string, unknown> = {};

  if (tipo) {
    const tipoMapping: Record<string, string[]> = {
      bdr: ['brd', 'bdr'],
      etf: ['etf'],
      reit: ['reit'],
      debenture: ['bond'],
      fundo: ['fund', 'funds'],
      'tesouro-direto': ['bond'],
      'renda-fixa-prefixada': ['bond'],
      'renda-fixa-posfixada': ['bond'],
      previdencia: ['previdencia'],
      criptoativo: ['crypto'],
      moeda: ['currency'],
      personalizado: ['custom'],
      'conta-corrente': ['cash'],
      poupanca: ['cash'],
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
    orderBy: [{ symbol: 'asc' }, { name: 'asc' }],
  });

  return NextResponse.json({
    success: true,
    assets: assets.map((asset) => ({
      id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      type: asset.type,
      currency: asset.currency,
      source: asset.source,
    })),
    count: assets.length,
  });
});
