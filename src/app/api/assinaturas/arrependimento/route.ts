import { NextRequest, NextResponse } from 'next/server';
import { assinaturasHabilitadas } from '@/lib/assinaturasConfig';
import { requireAuthWithActing } from '@/utils/auth';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { registrarArrependimento } from '@/services/assinaturas/checkout';

/**
 * POST /api/assinaturas/arrependimento — desistência da compra em até 7 dias da 1ª cobrança paga
 * (Decreto 7.962/2013, art. 5º). Grava o pedido, avisa o usuário (sininho) e os admins
 * (sininho + push) e responde na hora com o protocolo. O suporte reembolsa e cancela no
 * Dashboard; o webhook (charge.refunded) fecha o pedido.
 *
 * Chave desligada: 404. CSRF pelo middleware. Consultor agindo pelo cliente: 403. Fora da
 * janela ou sem compra paga: 409. Pedido repetido: 200 com o mesmo protocolo.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!assinaturasHabilitadas()) throw new ApiError(404, 'Não encontrado');

  const { payload, actingClient } = await requireAuthWithActing(request);
  if (actingClient) {
    throw new ApiError(403, 'A desistência só pode ser pedida pelo próprio cliente');
  }

  const resultado = await registrarArrependimento(payload.id);
  return NextResponse.json(resultado, { status: resultado.novo ? 201 : 200 });
});
