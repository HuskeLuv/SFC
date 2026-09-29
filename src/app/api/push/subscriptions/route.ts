/**
 * Assinaturas de web push do usuário da SESSÃO (PWA fase 5, fatia A).
 * Contrato HTTP no docblock de `src/lib/push/contract.ts`:
 *
 *  POST   → 204, upsert por endpoint (identidade da assinatura; re-POST
 *           reconcilia rotação de endpoint e reassocia ao usuário da sessão)
 *  GET    → lista dos aparelhos do usuário, com rótulo derivado do user-agent
 *  DELETE → 204, remove a assinatura DESTE aparelho (por endpoint)
 *
 * `requireSession` de propósito (NUNCA `requireAuthWithActing`): consultor
 * personificando jamais assina/lista/remove push como o cliente. GET e DELETE
 * funcionam mesmo com o push desligado — desligar a env não pode prender
 * assinaturas órfãs no banco.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireSession } from '@/utils/auth';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import { pushHabilitado } from '@/lib/push/pushConfig';

const subscriptionSchema = z.object({
  endpoint: z.string().url().startsWith('https://'),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  userAgent: z.string().max(1000).optional(),
});

const deleteSchema = z.object({ endpoint: z.string().url() });

/** Rótulo legível do aparelho — parse simples de propósito (navegador + tipo). */
const rotuloDoUserAgent = (userAgent: string | null): string => {
  if (!userAgent) return 'Aparelho desconhecido';
  const navegador = /edg\//i.test(userAgent)
    ? 'Edge'
    : /opr\/|opera/i.test(userAgent)
      ? 'Opera'
      : /samsungbrowser/i.test(userAgent)
        ? 'Samsung Internet'
        : /firefox|fxios/i.test(userAgent)
          ? 'Firefox'
          : /chrome|crios/i.test(userAgent)
            ? 'Chrome'
            : /safari/i.test(userAgent)
              ? 'Safari'
              : 'Navegador';
  const celular = /mobi|iphone|ipod|ipad|android/i.test(userAgent);
  return `${navegador} · ${celular ? 'celular' : 'computador'}`;
};

export const GET = withErrorHandler(async (request: NextRequest) => {
  const payload = await requireSession(request);
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: payload.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, userAgent: true, createdAt: true, endpoint: true },
  });
  return NextResponse.json({
    subscriptions: subscriptions.map((sub) => ({
      id: sub.id,
      rotulo: rotuloDoUserAgent(sub.userAgent),
      criadoEm: sub.createdAt.toISOString(),
      // Só para o cliente marcar "este aparelho" — nunca exibido cru.
      endpoint: sub.endpoint,
    })),
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const payload = await requireSession(request);
  if (!pushHabilitado()) throw new ApiError(503, 'Web push desabilitado');

  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed);
  const { endpoint, keys, userAgent } = parsed.data;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: payload.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent ?? null,
    },
    update: {
      userId: payload.id,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent ?? null,
    },
  });
  return new NextResponse(null, { status: 204 });
});

export const DELETE = withErrorHandler(async (request: NextRequest) => {
  const payload = await requireSession(request);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed);

  await prisma.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId: payload.id },
  });
  return new NextResponse(null, { status: 204 });
});
