/**
 * Equipe My Finance na comunidade (só admin do sistema):
 * GET  /api/comunidade/equipe → membros com cargo "equipe"
 * POST /api/comunidade/equipe { email, cargo } → dá/tira o cargo (selo + moderação)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { requireAdmin } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import type { MembroEquipe } from '@/types/comunidade';
import { exigirComunidadeHabilitada } from '@/services/comunidade/membro';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  exigirComunidadeHabilitada();
  requireAdmin(request);
  const perfis = await prisma.communityProfile.findMany({
    where: { cargo: 'equipe' },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const equipe: MembroEquipe[] = perfis.map((p) => ({
    userId: p.userId,
    nome: p.user.name,
    email: p.user.email,
    cargo: p.cargo,
  }));
  return NextResponse.json({ equipe }, { headers: { 'Cache-Control': 'no-store' } });
});

const cargoSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  cargo: z.enum(['membro', 'equipe']),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  exigirComunidadeHabilitada();
  requireAdmin(request);
  const parsed = cargoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, 'Dados inválidos');

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, name: true, email: true, communityProfile: { select: { userId: true } } },
  });
  if (!user) throw new ApiError(404, 'Usuário não encontrado');
  if (!user.communityProfile) {
    throw new ApiError(
      409,
      'Essa pessoa ainda não entrou na comunidade (precisa aceitar o termo primeiro)',
    );
  }
  const perfil = await prisma.communityProfile.update({
    where: { userId: user.id },
    data: {
      cargo: parsed.data.cargo,
      // quem vira equipe não pode ficar suspenso
      ...(parsed.data.cargo === 'equipe' ? { suspensoAte: null, suspensoMotivo: null } : {}),
    },
  });
  const membro: MembroEquipe = {
    userId: user.id,
    nome: user.name,
    email: user.email,
    cargo: perfil.cargo,
  };
  return NextResponse.json({ membro });
});
