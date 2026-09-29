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
import { createHash } from 'crypto';
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

/**
 * Teto de assinaturas por usuário (QA segurança): sem ele, um usuário autenticado
 * acumularia milhares de endpoints https arbitrários e cada notificação própria
 * viraria um burst de POSTs do servidor (relay/amplificação). 10 cobre com folga
 * os aparelhos reais de uma pessoa; ao estourar, a assinatura mais antiga cai.
 */
const MAX_ASSINATURAS_POR_USUARIO = 10;

/** O endpoint é URL-capacidade — fora do banco ele circula só como hash (QA segurança). */
const hashDoEndpoint = (endpoint: string): string =>
  createHash('sha256').update(endpoint).digest('base64');

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
      // Só para o cliente marcar "este aparelho" — o endpoint cru nunca sai do servidor.
      endpointHash: hashDoEndpoint(sub.endpoint),
    })),
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const payload = await requireSession(request);
  if (!pushHabilitado()) throw new ApiError(503, 'Web push desabilitado');

  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed);
  const { endpoint, keys, userAgent } = parsed.data;

  // Reassociar a assinatura de OUTRO usuário exige as keys originais: o endpoint é
  // URL-capacidade e pode vazar (log, proxy); as p256dh/auth só existem no navegador
  // que assinou. Troca de conta no mesmo navegador mantém as keys → segue permitida.
  // 204 de propósito (sem oráculo de existência).
  const existente = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  if (
    existente &&
    existente.userId !== payload.id &&
    (existente.p256dh !== keys.p256dh || existente.auth !== keys.auth)
  ) {
    return new NextResponse(null, { status: 204 });
  }

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

  // Estourou o teto? A mais antiga sai (o aparelho dela reassina sozinho no próximo uso —
  // o sync do pushClient re-POSTa a assinatura local ao abrir o app).
  const excedentes = await prisma.pushSubscription.findMany({
    where: { userId: payload.id },
    orderBy: { createdAt: 'desc' },
    skip: MAX_ASSINATURAS_POR_USUARIO,
    select: { id: true },
  });
  if (excedentes.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: excedentes.map((sub) => sub.id) } },
    });
  }
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
