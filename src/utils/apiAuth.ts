import type { NextApiRequest } from 'next';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';

export class ApiAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface ApiAuthPayload {
  id: string;
  email: string;
  role: UserRole;
}

export const authenticateApiUser = (req: NextApiRequest): ApiAuthPayload => {
  const token = req.cookies?.token;
  if (!token) {
    throw new ApiAuthError(401, 'Não autenticado');
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as ApiAuthPayload;
    return payload;
  } catch {
    throw new ApiAuthError(401, 'Token inválido');
  }
};

export const ensureUserRole = (payload: ApiAuthPayload, allowedRoles: UserRole[]) => {
  if (!allowedRoles.includes(payload.role)) {
    throw new ApiAuthError(403, 'Acesso não autorizado');
  }
};

