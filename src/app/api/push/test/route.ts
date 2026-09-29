/**
 * POST /api/push/test — aviso de teste para O APARELHO CHAMADOR (PWA fase 5).
 *
 * O cliente manda o endpoint da própria assinatura; o envio só sai se ela
 * pertencer ao usuário da SESSÃO (`requireSession` — acting do consultor é
 * ignorado). Tier de rate limit próprio (~5/min por IP) em
 * `src/lib/rateLimit.ts`, aplicado pelo middleware.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireSession } from '@/utils/auth';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import { pushHabilitado } from '@/lib/push/pushConfig';
import { getWebPush } from '@/lib/webPush';
import { corpoGenerico, TTL_SEGUNDOS_POR_CATEGORIA, type PushPayloadV1 } from '@/lib/push/contract';

const testSchema = z.object({ endpoint: z.string().url() });

export const POST = withErrorHandler(async (request: NextRequest) => {
  const payload = await requireSession(request);
  if (!pushHabilitado()) throw new ApiError(503, 'Web push desabilitado');

  const parsed = testSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed);

  const subscription = await prisma.pushSubscription.findFirst({
    where: { endpoint: parsed.data.endpoint, userId: payload.id },
  });
  if (!subscription) throw new ApiError(404, 'Assinatura deste aparelho não encontrada');

  const push: PushPayloadV1 = {
    v: 1,
    categoria: 'conta',
    title: 'Aviso de teste do My Finance',
    body: corpoGenerico('conta'),
    url: '/profile',
    // Tag fixa: repetir o teste substitui o aviso anterior em vez de empilhar.
    tag: 'mf-conta-teste',
    notificationId: 'teste',
  };

  try {
    await getWebPush().sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(push),
      { TTL: TTL_SEGUNDOS_POR_CATEGORIA.conta, urgency: 'normal' },
    );
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: subscription.endpoint } });
      throw new ApiError(410, 'Assinatura expirada — ative as notificações de novo.');
    }
    throw new ApiError(502, 'Não foi possível enviar o aviso de teste.');
  }
  return new NextResponse(null, { status: 204 });
});
