import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { registrarConexao } from '@/services/pluggy/sync';
import { requireProprioUsuarioPluggy } from '../_lib/auth';
import { serializeConnection } from '../_lib/serializer';

/**
 * GET  /api/pluggy/connections          → conexões do usuário com contas
 * POST /api/pluggy/connections {itemId} → registra o item criado pelo widget e faz a 1ª carga
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const user = await requireProprioUsuarioPluggy(request);
  const rows = await prisma.bankConnection.findMany({
    where: { userId: user.id },
    include: { accounts: { orderBy: { name: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(
    { connections: rows.map(serializeConnection) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

const bodySchema = z.object({ itemId: z.string().uuid() });

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await requireProprioUsuarioPluggy(request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, 'itemId inválido');
  const conexao = await registrarConexao(user.id, parsed.data.itemId);
  return NextResponse.json({ connection: serializeConnection(conexao) }, { status: 201 });
});
