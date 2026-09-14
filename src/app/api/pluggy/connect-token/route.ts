import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { getPluggyClient } from '@/lib/pluggy';
import { pluggyIncluiSandbox } from '@/lib/pluggyConfig';
import { requireProprioUsuarioPluggy } from '../_lib/auth';

/**
 * POST /api/pluggy/connect-token — token de 30 min para abrir o Pluggy Connect.
 * Body opcional `{ itemId }` = modo "reconectar" de uma conexão do próprio usuário.
 * O token é amarrado ao usuário (clientUserId) — é isso que permite ao
 * POST /connections recusar item de terceiro.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PRODUTOS_FASE_2 = [
  'ACCOUNTS',
  'CREDIT_CARDS',
  'TRANSACTIONS',
  'PAYMENT_DATA',
] as const;

const bodySchema = z.object({ itemId: z.string().uuid().optional() }).default({});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await requireProprioUsuarioPluggy(request);
  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) throw new ApiError(400, 'Dados inválidos');

  let itemId: string | undefined;
  if (parsed.data.itemId) {
    const conexao = await prisma.bankConnection.findFirst({
      where: { providerItemId: parsed.data.itemId, userId: user.id },
      select: { providerItemId: true },
    });
    if (!conexao) throw new ApiError(404, 'Conexão não encontrada');
    itemId = conexao.providerItemId;
  }

  const { accessToken } = await getPluggyClient().createConnectToken(itemId, {
    clientUserId: user.id,
    avoidDuplicates: true,
  });
  // Só contas e cartões nesta fase (decisão 14/09/2026): consentimento mínimo,
  // limites mensais do Open Finance poupados para o que usamos.
  return NextResponse.json(
    { accessToken, includeSandbox: pluggyIncluiSandbox(), products: PRODUTOS_FASE_2 },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
