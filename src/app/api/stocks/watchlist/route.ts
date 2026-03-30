import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { watchlistAddSchema, validationError } from '@/utils/validation-schemas';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { parsePaginationParams, paginatedResponse } from '@/utils/pagination';

// GET - Buscar watchlist do usuário
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  const pagination = parsePaginationParams(request);

  if (!pagination) {
    const watchlist = await prisma.watchlist.findMany({
      where: { userId: user.id },
      include: {
        stock: true,
      },
      orderBy: { addedAt: 'desc' },
    });

    return NextResponse.json(watchlist);
  }

  const where = { userId: user.id };
  const [count, watchlist] = await Promise.all([
    prisma.watchlist.count({ where }),
    prisma.watchlist.findMany({
      where,
      include: { stock: true },
      orderBy: { addedAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    }),
  ]);

  return NextResponse.json(paginatedResponse(watchlist, count, pagination.page, pagination.limit));
});

// POST - Adicionar ativo ao watchlist
export const POST = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  const body = await request.json();
  const parsed = watchlistAddSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { stockId, notes } = parsed.data;

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
});
