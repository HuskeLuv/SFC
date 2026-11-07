import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { assinaturasHabilitadas } from '@/lib/assinaturasConfig';
import { registrarConexao, resumoImportado } from '@/services/pluggy/sync';
import {
  exigirConsentimentoPendente,
  vincularConsentimento,
} from '@/services/pluggy/consentimento';
import { requireProprioUsuarioPluggy } from '../_lib/auth';
import { exigirVagaConexao } from '../_lib/limiteConexoes';
import { serializeConnection } from '../_lib/serializer';

/**
 * GET  /api/pluggy/connections          → conexões do usuário com contas
 * POST /api/pluggy/connections {itemId, consentimentoId} → registra o item criado pelo widget,
 *      liga o aceite à conexão e faz a 1ª carga. Assinaturas (F2): defesa dupla do limite de
 *      conexões do connect-token — item que ainda não é do usuário com o plano no limite → 403
 *      { codigo: 'limite_plano' } (só com ASSINATURAS_HABILITADAS ligada). O item já criado no
 *      Pluggy NÃO é apagado aqui (o widget só abre com o token, que já barra no limite).
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
  if (assinaturasHabilitadas()) {
    const jaEhDoUsuario = await prisma.bankConnection.findFirst({
      where: { providerItemId: parsed.data.itemId, userId: user.id },
      select: { id: true },
    });
    if (!jaEhDoUsuario) await exigirVagaConexao(user.id);
  }
  await exigirConsentimentoPendente(user.id, parsed.data.consentimentoId);
  const r = await registrarConexao(user.id, parsed.data.itemId);
  await vincularConsentimento(user.id, parsed.data.consentimentoId, r.conexao);
  const aviso = r.reaproveitada
    ? 'Este banco já estava conectado: a conexão existente foi atualizada com a nova autorização.'
    : r.contasRepetidas > 0
      ? `${r.contasRepetidas} ${r.contasRepetidas === 1 ? 'conta já existia' : 'contas já existiam'} em outra conexão e ${r.contasRepetidas === 1 ? 'ficou desativada' : 'ficaram desativadas'} para não duplicar.`
      : null;
  return NextResponse.json(
    {
      connection: serializeConnection(r.conexao),
      reaproveitada: r.reaproveitada,
      aviso,
      // Tela "Conexão realizada": o que chegou, por tipo de dado.
      importados: await resumoImportado(r.conexao.id),
    },
    { status: r.reaproveitada ? 200 : 201 },
  );
});
