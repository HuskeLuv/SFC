import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { ConsultantClientStatus, UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';

type ApiError = {
  status: number;
  message: string;
};

export type AuthenticatedConsultant = {
  consultantId: string;
  userId: string;
};

export const authenticateConsultant = async (
  request: NextRequest,
): Promise<AuthenticatedConsultant> => {
  const token = request.cookies.get('token')?.value;
  if (!token) {
    throw <ApiError>{ status: 401, message: 'Não autenticado' };
  }

  let payload: { id: string; email: string; role: UserRole };
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET as string) as typeof payload;
  } catch {
    throw <ApiError>{ status: 401, message: 'Token inválido' };
  }

  if (payload.role !== UserRole.consultant) {
    throw <ApiError>{ status: 403, message: 'Acesso restrito a consultores' };
  }

  const consultant = await prisma.consultant.findFirst({
    where: {
      OR: [{ id: payload.id }, { userId: payload.id }],
    },
  });

  if (!consultant) {
    throw <ApiError>{ status: 403, message: 'Perfil de consultor não encontrado' };
  }

  return {
    consultantId: consultant.id,
    userId: consultant.userId,
  };
};

export const assertClientOwnership = async (consultantId: string, clientId: string) => {
  if (!clientId) {
    throw <ApiError>{ status: 400, message: 'Cliente não informado' };
  }

  const assignment = await prisma.clientConsultant.findFirst({
    where: {
      consultantId,
      clientId,
      status: ConsultantClientStatus.active,
    },
  });

  if (!assignment) {
    throw <ApiError>{ status: 404, message: 'Cliente não vinculado ao consultor' };
  }

  return assignment;
};
