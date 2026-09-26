/**
 * Resolve quem está usando a Comunidade a partir do request.
 *
 * Usa SEMPRE o usuário logado (payload.id), nunca o cliente personificado:
 * consultor agindo por um cliente não pode publicar em nome dele.
 */

import type { NextRequest } from 'next/server';
import type { CommunityProfile, UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/utils/auth';
import { ApiError } from '@/utils/apiErrorHandler';
import { canAccess } from '@/utils/accessLevel';
import { comunidadeHabilitada } from '@/lib/comunidadeConfig';
import { COMUNIDADE_REQUIRED_LEVEL, COMUNIDADE_TERMO_VERSAO } from '@/constants/comunidade';
import { estaSuspenso, podeModerar } from './permissoes';

export interface Membro {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  accessLevel: number;
  perfil: CommunityProfile | null;
  moderador: boolean;
}

/** Comunidade desligada pela flag → 503 em toda a API. */
export function exigirComunidadeHabilitada(): void {
  if (!comunidadeHabilitada()) throw new ApiError(503, 'Comunidade desabilitada');
}

/** Autenticado + dentro da trava de acesso. Perfil pode não existir (termo pendente). */
export async function exigirAcesso(request: NextRequest): Promise<Membro> {
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
  if (!user) throw new ApiError(401, 'Não autorizado');
  if (!canAccess(user.accessLevel, COMUNIDADE_REQUIRED_LEVEL)) {
    throw new ApiError(403, 'A comunidade não está disponível no seu plano');
  }
  const perfil = user.communityProfile;
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    accessLevel: user.accessLevel,
    perfil,
    moderador: podeModerar({ role: user.role, cargo: perfil?.cargo ?? null }),
  };
}

/** Termo aceito (na versão vigente). Moderação e leitura exigem isso. */
export async function exigirMembro(
  request: NextRequest,
): Promise<Membro & { perfil: CommunityProfile }> {
  const membro = await exigirAcesso(request);
  if (!membro.perfil || membro.perfil.termoVersao !== COMUNIDADE_TERMO_VERSAO) {
    throw new ApiError(403, 'Aceite o termo de uso da comunidade para continuar');
  }
  return membro as Membro & { perfil: CommunityProfile };
}

/** Membro que pode escrever agora (não suspenso). */
export async function exigirMembroAtivo(
  request: NextRequest,
): Promise<Membro & { perfil: CommunityProfile }> {
  const membro = await exigirMembro(request);
  if (estaSuspenso(membro.perfil.suspensoAte)) {
    const ate = membro.perfil.suspensoAte!.toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });
    throw new ApiError(403, `Sua participação na comunidade está suspensa até ${ate}`);
  }
  return membro;
}

export async function exigirModerador(
  request: NextRequest,
): Promise<Membro & { perfil: CommunityProfile }> {
  const membro = await exigirMembro(request);
  if (!membro.moderador) throw new ApiError(403, 'Acesso negado');
  return membro;
}
