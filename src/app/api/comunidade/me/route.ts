/**
 * GET /api/comunidade/me → situação de quem está vendo a comunidade: acesso
 * (trava por accessLevel), termo aceito, suspensão e poderes de moderação.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireSession } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { canAccess } from '@/utils/accessLevel';
import { COMUNIDADE_REQUIRED_LEVEL, COMUNIDADE_TERMO_VERSAO } from '@/constants/comunidade';
import { estaSuspenso, podeModerar, selosDoAutor } from '@/services/comunidade/permissoes';
import type { MeComunidadeResponse } from '@/types/comunidade';
import { exigirComunidadeHabilitada } from '@/services/comunidade/membro';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  exigirComunidadeHabilitada();
  const payload = await requireSession(request);
  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      role: true,
      accessLevel: true,
      communityProfile: true,
    },
  });
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const perfil = user.communityProfile;
  const body: MeComunidadeResponse = {
    acesso: canAccess(user.accessLevel, COMUNIDADE_REQUIRED_LEVEL),
    membro: perfil?.termoVersao === COMUNIDADE_TERMO_VERSAO,
    termoVersao: COMUNIDADE_TERMO_VERSAO,
    usuario: {
      id: user.id,
      nome: user.name,
      avatarUrl: user.avatarUrl,
      selos: selosDoAutor(user.role, perfil?.cargo),
    },
    perfil: perfil
      ? {
          bio: perfil.bio,
          cargo: perfil.cargo,
          termoVersao: perfil.termoVersao,
          termoAceitoEm: perfil.termoAceitoEm.toISOString(),
          suspensoAte: perfil.suspensoAte?.toISOString() ?? null,
          suspensoMotivo: perfil.suspensoMotivo,
        }
      : null,
    suspenso: estaSuspenso(perfil?.suspensoAte),
    moderador: podeModerar({ role: user.role, cargo: perfil?.cargo ?? null }),
    admin: user.role === 'admin',
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
});
