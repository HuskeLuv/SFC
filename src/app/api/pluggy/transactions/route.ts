import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { requireProprioUsuarioPluggy } from '../_lib/auth';
import { serializeTransaction } from '../_lib/serializer';

/**
 * GET /api/pluggy/transactions?accountId=&from=YYYY-MM-DD&to=YYYY-MM-DD&page=&limit=
 * Extrato do ledger (sem as removidas no provedor). Só o próprio usuário.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  accountId: z.string().uuid().optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const user = await requireProprioUsuarioPluggy(request);
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) throw new ApiError(400, 'Parâmetros inválidos');
  const q = parsed.data;

  const where = {
    userId: user.id,
    deletedAt: null,
    ...(q.accountId ? { accountId: q.accountId } : {}),
    ...(q.from || q.to
      ? {
          date: {
            ...(q.from ? { gte: new Date(`${q.from}T00:00:00.000Z`) } : {}),
            ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.bankTransaction.count({ where }),
    prisma.bankTransaction.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
  ]);

  return NextResponse.json(
    {
      transactions: rows.map(serializeTransaction),
      pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
