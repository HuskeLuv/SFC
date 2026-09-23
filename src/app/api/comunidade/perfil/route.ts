/**
 * PUT /api/comunidade/perfil → entra na comunidade (aceite do termo) e/ou
 * atualiza a bio. Body: { aceitarTermo?: true, bio?: string | null }
 *
 * O aceite também vira um UserConsent ("community-terms"), no mesmo registro
 * dos termos do app (IP + user agent), para a trilha LGPD.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rateLimit';
import {
  COMUNIDADE_LIMITES,
  COMUNIDADE_TERMO_DOCUMENTO,
  COMUNIDADE_TERMO_VERSAO,
} from '@/constants/comunidade';
import { exigirAcesso } from '@/services/comunidade/membro';
import { normalizarTexto } from '@/services/comunidade/permissoes';

const perfilSchema = z.object({
  aceitarTermo: z.literal(true).optional(),
  bio: z.string().max(COMUNIDADE_LIMITES.bioMaxChars).nullable().optional(),
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
  const membro = await exigirAcesso(request);

  const parsed = perfilSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new ApiError(400, 'Dados inválidos', parsed.error.flatten().fieldErrors);
  }
  const { aceitarTermo, bio } = parsed.data;
  const termoVigente = membro.perfil?.termoVersao === COMUNIDADE_TERMO_VERSAO;
  if (!aceitarTermo && !termoVigente) {
    throw new ApiError(403, 'Aceite o termo de uso da comunidade para continuar');
  }

  const bioNormalizada = bio === undefined ? undefined : bio ? normalizarTexto(bio) || null : null;
  const agora = new Date();
  const aceite = aceitarTermo && !termoVigente;

  const perfil = await prisma.$transaction(async (tx) => {
    const salvo = await tx.communityProfile.upsert({
      where: { userId: membro.id },
      create: {
        userId: membro.id,
        bio: bioNormalizada ?? null,
        termoVersao: COMUNIDADE_TERMO_VERSAO,
        termoAceitoEm: agora,
      },
      update: {
        ...(bioNormalizada !== undefined ? { bio: bioNormalizada } : {}),
        ...(aceite ? { termoVersao: COMUNIDADE_TERMO_VERSAO, termoAceitoEm: agora } : {}),
      },
    });
    if (aceite) {
      await tx.userConsent.create({
        data: {
          userId: membro.id,
          documentType: COMUNIDADE_TERMO_DOCUMENTO,
          documentVersion: COMUNIDADE_TERMO_VERSAO,
          acceptedAt: agora,
          ipAddress: getClientIp(request),
          userAgent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
        },
      });
    }
    return salvo;
  });

  return NextResponse.json({
    perfil: {
      bio: perfil.bio,
      cargo: perfil.cargo,
      termoVersao: perfil.termoVersao,
      termoAceitoEm: perfil.termoAceitoEm.toISOString(),
    },
  });
});
