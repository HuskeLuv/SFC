import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { assinaturasHabilitadas } from '@/lib/assinaturasConfig';
import { getClientIp } from '@/lib/rateLimit';
import { requireAuthWithActing } from '@/utils/auth';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import { criarSessaoCheckout, VERSAO_TERMOS_VENDA } from '@/services/assinaturas/checkout';

/**
 * POST /api/assinaturas/checkout {plano: 'pro'|'adv', intervalo: 'mes'|'ano', aceiteTermos: true}
 * → {url} do Checkout hospedado do Stripe (ou do Portal, se já houver assinatura viva).
 *
 * - Chave desligada: 404. CSRF pelo middleware (front usa csrfFetch).
 * - Consultor agindo pelo cliente: 403 (consultor não compra pelo cliente). O userId que vai ao
 *   Stripe é SEMPRE o do requisitante (payload.id).
 * - Sem aceite dos Termos: 400. Com aceite: UserConsent 'terms-of-sale' (versão, IP, UA).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const corpoSchema = z.object({
  plano: z.enum(['pro', 'adv']),
  intervalo: z.enum(['mes', 'ano']),
  aceiteTermos: z.literal(true, { message: 'É preciso aceitar os Termos de Uso para assinar' }),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!assinaturasHabilitadas()) throw new ApiError(404, 'Não encontrado');

  const { payload, actingClient } = await requireAuthWithActing(request);
  if (actingClient) {
    throw new ApiError(403, 'A assinatura só pode ser contratada pelo próprio cliente');
  }

  const body: unknown = await request.json().catch(() => ({}));
  const parsed = corpoSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, email: true, name: true },
  });
  if (!user) throw new ApiError(404, 'Usuário não encontrado');

  await prisma.userConsent.create({
    data: {
      userId: user.id,
      documentType: 'terms-of-sale',
      documentVersion: VERSAO_TERMOS_VENDA,
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') || null,
    },
  });

  const resultado = await criarSessaoCheckout({
    userId: user.id,
    email: user.email,
    name: user.name,
    plano: parsed.data.plano,
    intervalo: parsed.data.intervalo,
  });
  return NextResponse.json(resultado);
});
