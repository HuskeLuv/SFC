/**
 * Preferências de web push por categoria (PWA fase 5, fatia A).
 * Contrato HTTP no docblock de `src/lib/push/contract.ts`:
 *
 *  GET   → { habilitado, vapidPublicKey, categorias, comunidadeVisivel, analiseVisivel }
 *          (a chave pública VAPID viaja aqui — envs sem NEXT_PUBLIC). analiseVisivel = o
 *          recurso 'alertas' da Análise de Ativos (flag ALERTAS + SALVOS + área liberada para o
 *          usuário da sessão): só então a linha "Análise de Ativos" aparece no Perfil.
 *  PATCH → 204, parcial; linha criada sob demanda no molde da AgendaPreferencia
 *          (sem registro = tudo ligado)
 *
 * `requireSession` de propósito: a preferência é do dono da conta — o cookie
 * de acting do consultor é ignorado.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireSession } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import { pushHabilitado, vapidPublicKey } from '@/lib/push/pushConfig';
import { comunidadeHabilitada } from '@/lib/comunidadeConfig';
import { recursosLiberados } from '@/services/analiseAtivos/acesso/acessoAnalise';

const patchSchema = z
  .object({
    orcamento: z.boolean().optional(),
    agenda: z.boolean().optional(),
    comunidade: z.boolean().optional(),
    conta: z.boolean().optional(),
    analise: z.boolean().optional(),
  })
  .strict();

export const GET = withErrorHandler(async (request: NextRequest) => {
  const payload = await requireSession(request);
  const [pref, recursos] = await Promise.all([
    prisma.pushPreferencia.findUnique({ where: { userId: payload.id } }),
    recursosLiberados(payload.id),
  ]);
  const habilitado = pushHabilitado();
  return NextResponse.json({
    habilitado,
    vapidPublicKey: habilitado ? vapidPublicKey() : null,
    categorias: {
      orcamento: pref?.orcamento ?? true,
      agenda: pref?.agenda ?? true,
      comunidade: pref?.comunidade ?? true,
      conta: pref?.conta ?? true,
      analise: pref?.analise ?? true,
    },
    // A linha "Comunidade" só aparece na UI quando a feature existe para o usuário.
    comunidadeVisivel: comunidadeHabilitada(),
    // A linha "Análise de Ativos" só aparece com os avisos das listas liberados para o usuário.
    analiseVisivel: recursos.alertas,
  });
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const payload = await requireSession(request);
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed);

  await prisma.pushPreferencia.upsert({
    where: { userId: payload.id },
    create: { userId: payload.id, ...parsed.data },
    update: parsed.data,
  });
  return new NextResponse(null, { status: 204 });
});
