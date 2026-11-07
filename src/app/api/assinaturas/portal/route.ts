import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { assinaturasHabilitadas } from '@/lib/assinaturasConfig';
import { requireAuthWithActing } from '@/utils/auth';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { criarSessaoPortal } from '@/services/assinaturas/checkout';

/**
 * POST /api/assinaturas/portal → {url} do Portal do Stripe (pagamento, faturas, troca de plano e
 * cancelamento), com return_url em /profile.
 *
 * Chave desligada: 404. CSRF pelo middleware. Consultor agindo pelo cliente: 403. Sem Customer
 * (nunca abriu o Checkout): 409.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!assinaturasHabilitadas()) throw new ApiError(404, 'Não encontrado');

  const { payload, actingClient } = await requireAuthWithActing(request);
  if (actingClient) {
    throw new ApiError(403, 'A assinatura só pode ser gerenciada pelo próprio cliente');
  }

  const linha = await prisma.assinatura.findUnique({
    where: { userId: payload.id },
    select: { stripeCustomerId: true },
  });
  if (!linha?.stripeCustomerId) throw new ApiError(409, 'Você ainda não tem assinatura');

  return NextResponse.json(await criarSessaoPortal(linha.stripeCustomerId));
});
