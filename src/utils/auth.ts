import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { resolveActingContext } from '@/utils/consultantActing';

export interface JWTPayload {
  id: string;
  email: string;
  role: 'user' | 'consultant' | 'admin';
  iat?: number;
  exp?: number;
}

export function verifyJWT(request: NextRequest): JWTPayload | null {
  try {
    const token = request.cookies.get('token')?.value;
    
    if (!token) {
      return null;
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    return payload;
  } catch {
    return null;
  }
}

export function requireAuth(request: NextRequest): JWTPayload {
  const payload = verifyJWT(request);
  
  if (!payload) {
    throw new Error('Não autorizado');
  }
  
  return payload;
} 

export interface AuthWithActingResult {
  payload: JWTPayload;
  targetUserId: string;
  actingClient: Awaited<ReturnType<typeof resolveActingContext>>['actingClient'];
}

export async function requireAuthWithActing(request: NextRequest): Promise<AuthWithActingResult> {
  const payload = requireAuth(request);
  const actingContext = await resolveActingContext(request, {
    id: payload.id,
    role: payload.role as UserRole,
  });

  return {
    payload,
    targetUserId: actingContext.targetUserId,
    actingClient: actingContext.actingClient,
  };
}