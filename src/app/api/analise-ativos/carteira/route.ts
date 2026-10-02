import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirAcessoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { overlayCarteira } from '@/services/analiseAtivos/leitura/overlayCarteira';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';

/**
 * GET /api/analise-ativos/carteira — overlay DB-only (fatia D): em qual aba efetiva está cada
 * ticker que o usuário tem ou planejou. Sem preço e sem valor. targetUserId: o consultor agindo
 * vê o cliente (e o acesso fica registrado). Sem cache HTTP (no-store) e sem cache no servidor —
 * logo depois de "Planejar na Carteira" o selo tem de aparecer.
 */
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await exigirAcessoAnalise(request);
  if (actingClient) {
    await logSensitiveEndpointAccess(
      request,
      payload,
      targetUserId,
      actingClient,
      '/api/analise-ativos/carteira',
      'GET',
    );
  }
  const corpo = await overlayCarteira(targetUserId);
  return NextResponse.json(corpo, { headers: { 'Cache-Control': 'no-store' } });
});
