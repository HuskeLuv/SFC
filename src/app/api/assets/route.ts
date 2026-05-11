import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Consolidação Stock → Asset (Sprint 4 / bug #16): toda busca de ativos passa
 * por `prisma.asset`. A tabela `Stock` foi descontinuada — o cron BRAPI já
 * popula `Asset` com ações/FIIs/BDRs/etc., então o autocomplete do wizard
 * passa a refletir o catálogo vivo sem depender de seed manual.
 *
 * Para `tipoAtivo=acoes-brasil` o frontend espera que o `id` venha prefixado
 * com `acao:` ou `bdr:` — o `handleAssetSelect` em Step3Asset usa esse prefixo
 * para preencher `acoesBrasilTipo` (campo exigido pela validação). Mantemos
 * a convenção pra evitar mudança no frontend.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const tipo = searchParams.get('tipo') || '';
  const limit = parseInt(searchParams.get('limit') || '20');

  // Helper de busca por symbol/name (case-insensitive)
  const buildSearchClause = (s: string): Record<string, unknown> | undefined => {
    if (!s) return undefined;
    return {
      OR: [
        { symbol: { contains: s, mode: 'insensitive' } },
        { name: { contains: s, mode: 'insensitive' } },
      ],
    };
  };

  // ──────────────────────────────────────────────────────────────────────
  // Ações Brasil — combina type='stock' e type='bdr' / 'brd' (mesma busca)
  // ──────────────────────────────────────────────────────────────────────
  if (tipo === 'acoes-brasil') {
    const halfLimit = Math.ceil(limit / 2);
    const [stocks, bdrs] = await Promise.all([
      prisma.asset.findMany({
        where: {
          type: 'stock',
          ...(search ? buildSearchClause(search) : {}),
        },
        take: halfLimit,
        orderBy: [{ symbol: 'asc' }],
      }),
      prisma.asset.findMany({
        where: {
          type: { in: ['bdr', 'brd'] },
          ...(search ? buildSearchClause(search) : {}),
        },
        take: halfLimit,
        orderBy: [{ symbol: 'asc' }],
      }),
    ]);

    return NextResponse.json({
      success: true,
      assets: [
        ...stocks.map((a) => ({
          id: `acao:${a.id}`,
          symbol: a.symbol,
          name: a.name,
          type: 'acao',
          currency: a.currency,
          source: a.source,
        })),
        ...bdrs.map((a) => ({
          id: `bdr:${a.id}`,
          symbol: a.symbol,
          name: a.name,
          type: 'bdr',
          currency: a.currency,
          source: a.source,
        })),
      ],
      count: stocks.length + bdrs.length,
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Ações — só type='stock'
  // ──────────────────────────────────────────────────────────────────────
  if (tipo === 'acao') {
    const assets = await prisma.asset.findMany({
      where: {
        type: 'stock',
        ...(search ? buildSearchClause(search) : {}),
      },
      take: limit,
      orderBy: [{ symbol: 'asc' }],
    });

    return NextResponse.json({
      success: true,
      assets: assets.map((a) => ({
        id: a.id,
        symbol: a.symbol,
        name: a.name,
        type: 'stock',
        currency: a.currency,
        source: a.source,
      })),
      count: assets.length,
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // FIIs — type='fii' (a heurística "ticker termina em 11" não é mais
  // necessária porque a migration de dados já classificou todo o legado
  // como type='fii' nesse caso).
  // ──────────────────────────────────────────────────────────────────────
  if (tipo === 'fii') {
    const assets = await prisma.asset.findMany({
      where: {
        type: 'fii',
        ...(search ? buildSearchClause(search) : {}),
      },
      take: limit,
      orderBy: [{ symbol: 'asc' }],
    });

    return NextResponse.json({
      success: true,
      assets: assets.map((a) => ({
        id: a.id,
        symbol: a.symbol,
        name: a.name,
        type: 'fii',
        currency: a.currency,
        source: a.source,
      })),
      count: assets.length,
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Tipos sem catálogo (adicionados manualmente)
  // ──────────────────────────────────────────────────────────────────────
  if (tipo === 'stock' || tipo === 'previdencia') {
    return NextResponse.json({
      success: true,
      assets: [],
      count: 0,
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Tesouro Direto
  // ──────────────────────────────────────────────────────────────────────
  if (tipo === 'tesouro-direto') {
    const assets = await prisma.asset.findMany({
      where: {
        type: 'tesouro-direto',
        source: 'tesouro_gov',
        ...(search ? buildSearchClause(search) : {}),
      },
      take: limit,
      orderBy: [{ name: 'asc' }],
    });

    return NextResponse.json({
      success: true,
      assets: assets.map((asset) => ({
        id: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        type: 'tesouro-direto',
        currency: 'BRL',
        source: 'tesouro_gov',
        currentPrice: asset.currentPrice?.toNumber() ?? null,
      })),
      count: assets.length,
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Fundos CVM
  // ──────────────────────────────────────────────────────────────────────
  if (tipo === 'fundo') {
    const assets = await prisma.asset.findMany({
      where: {
        type: { in: ['fund', 'funds'] },
        ...(search
          ? {
              OR: [
                { symbol: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
                { cnpj: { contains: search } },
              ],
            }
          : {}),
      },
      take: limit,
      orderBy: [{ name: 'asc' }],
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
        currentPrice: asset.currentPrice?.toNumber() ?? null,
      })),
      count: assets.length,
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Demais tipos (etf, reit, bdr, debenture, criptoativo, moeda, etc.)
  // ──────────────────────────────────────────────────────────────────────
  const baseFilters: Record<string, unknown> = {};

  if (tipo) {
    const tipoMapping: Record<string, string[]> = {
      bdr: ['brd', 'bdr'],
      etf: ['etf'],
      reit: ['reit'],
      debenture: ['bond'],
      'renda-fixa-prefixada': ['bond'],
      'renda-fixa-posfixada': ['bond'],
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

  let whereClause: Record<string, unknown>;
  if (search) {
    const andConditions: Record<string, unknown>[] = [];
    if (Object.keys(baseFilters).length > 0) andConditions.push(baseFilters);
    andConditions.push({
      OR: [
        { symbol: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ],
    });
    whereClause = { AND: andConditions };
  } else {
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
