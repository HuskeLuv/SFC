import { NextRequest, NextResponse } from 'next/server';
import { assinaturasHabilitadas } from '@/lib/assinaturasConfig';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { ASSINATURA_ME_DESLIGADA } from '@/types/assinatura';
import { montarAssinaturaMe, sincronizarSessaoDoDono } from '@/services/assinaturas/checkout';

/**
 * GET /api/assinaturas/me → AssinaturaMe (plano efetivo, origem, status, datas, janela dos 7 dias
 * e pedido de desistência).
 *
 * - Chave desligada: ASSINATURA_ME_DESLIGADA ({plano:'adv', origem:'desligado',
 *   habilitado:false}), sem tocar no Stripe nem nas tabelas novas.
 * - ?session_id=cs_… (retorno do Checkout): só sincroniza se a sessão for do PRÓPRIO
 *   requisitante (client_reference_id e customer da linha dele); qualquer outra é ignorada e
 *   a resposta é o estado atual. Consultor agindo pelo cliente nunca sincroniza.
 * - Consultor agindo pelo cliente: estado do cliente só para leitura (origem 'consultor').
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId } = await requireAuthWithActing(request);
  if (!assinaturasHabilitadas()) return NextResponse.json(ASSINATURA_ME_DESLIGADA);

  const sessionId = request.nextUrl.searchParams.get('session_id');
  if (sessionId && targetUserId === payload.id) {
    await sincronizarSessaoDoDono(payload.id, sessionId);
  }

  return NextResponse.json(
    await montarAssinaturaMe({ userId: targetUserId, requisitanteId: payload.id }),
  );
});
