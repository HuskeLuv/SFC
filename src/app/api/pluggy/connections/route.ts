import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { registrarConexao } from '@/services/pluggy/sync';
import {
  exigirConsentimentoPendente,
  vincularConsentimento,
} from '@/services/pluggy/consentimento';
import { requireProprioUsuarioPluggy } from '../_lib/auth';
import { serializeConnection } from '../_lib/serializer';

/**
 * GET  /api/pluggy/connections          → conexões do usuário com contas
 * POST /api/pluggy/connections {itemId, consentimentoId} → registra o item criado pelo widget,
 *      liga o aceite à conexão e faz a 1ª carga
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

const bodySchema = z.object({ itemId: z.string().uuid(), consentimentoId: z.string().uuid() });

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await requireProprioUsuarioPluggy(request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, 'itemId ou autorização inválidos');
  await exigirConsentimentoPendente(user.id, parsed.data.consentimentoId);
  const r = await registrarConexao(user.id, parsed.data.itemId);
  await vincularConsentimento(user.id, parsed.data.consentimentoId, r.conexao);
  const aviso = r.reaproveitada
    ? 'Este banco já estava conectado: a conexão existente foi atualizada com a nova autorização.'
    : r.contasRepetidas > 0
      ? `${r.contasRepetidas} ${r.contasRepetidas === 1 ? 'conta já existia' : 'contas já existiam'} em outra conexão e ${r.contasRepetidas === 1 ? 'ficou desativada' : 'ficaram desativadas'} para não duplicar.`
      : null;
  return NextResponse.json(
    { connection: serializeConnection(r.conexao), reaproveitada: r.reaproveitada, aviso },
    { status: r.reaproveitada ? 200 : 201 },
  );
});
