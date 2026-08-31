import { NextRequest } from 'next/server';
import { ConsultantClientStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireRole } from '@/utils/auth';
import { ApiError } from '@/utils/apiErrorHandler';

export type AuthenticatedConsultant = {
  consultantId: string;
  userId: string;
};

/**
 * Autentica um consultor: JWT válido + role consultant + perfil Consultant.
 *
 * Reescrito sobre requireRole (auditoria 29/08/2026, achado 2.5):
 * - o lookup do perfil usa APENAS userId — o OR anterior também casava
 *   Consultant.id com o id do User do JWT, misturando espaços de id;
 * - os erros agora são ApiError de verdade: antes eram objetos puros que o
 *   withErrorHandler não reconhecia e viravam 500 genérico.
 */
export const authenticateConsultant = async (
  request: NextRequest,
): Promise<AuthenticatedConsultant> => {
  const payload = requireRole(request, 'consultant');

  const consultant = await prisma.consultant.findFirst({
    where: { userId: payload.id },
  });

  if (!consultant) {
    throw new ApiError(403, 'Perfil de consultor não encontrado');
  }

  return {
    consultantId: consultant.id,
    userId: consultant.userId,
  };
};

export const assertClientOwnership = async (consultantId: string, clientId: string) => {
  if (!clientId) {
    throw new ApiError(400, 'Cliente não informado');
  }

  const assignment = await prisma.clientConsultant.findFirst({
    where: {
      consultantId,
      clientId,
      status: ConsultantClientStatus.active,
    },
  });

  if (!assignment) {
    throw new ApiError(404, 'Cliente não vinculado ao consultor');
  }

  return assignment;
};
