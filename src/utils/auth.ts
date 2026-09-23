import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { resolveActingContext } from '@/utils/consultantActing';
import { ApiError } from '@/utils/apiErrorHandler';
import { assertSessionVersion } from '@/lib/auth/sessionVersion';
import { SESSION_COOKIE } from '@/lib/auth/session';

export interface JWTPayload {
  id: string;
  email: string;
  role: 'user' | 'consultant' | 'admin';
  /** User.sessionVersion na emissão (ausente em tokens legados = 0). */
  sv?: number;
  /** "Manter conectado" (ausente em tokens legados: deduzido da duração). */
  rm?: boolean;
  /** auth_time em segundos (ausente em tokens legados = iat). */
  at?: number;
  iat?: number;
  exp?: number;
}

export function verifyJWT(request: NextRequest): JWTPayload | null {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;

    if (!token) {
      return null;
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Só verifica assinatura e exp do JWT — NÃO checa revogação (sessionVersion).
 *
 * @deprecated Use `requireSession` (ou `requireAuthWithActing`) nas rotas.
 * Mantido para o /api/auth/me e usos internos que checam a revogação à parte.
 */
export function requireAuth(request: NextRequest): JWTPayload {
  const payload = verifyJWT(request);

  if (!payload) {
    throw new Error('Não autorizado');
  }

  return payload;
}

/**
 * JWT válido + sessão não revogada (sessionVersion do token = a do banco,
 * cache de 60s). Lança Error('Não autorizado') sem token e
 * ApiError(401, 'Sessão expirada') com token revogado.
 */
export async function requireSession(request: NextRequest): Promise<JWTPayload> {
  const payload = requireAuth(request);
  await assertSessionVersion(payload);
  return payload;
}

/**
 * requireSession + exigência de role (auditoria 29/08/2026, achado 2.5).
 * Lança ApiError(403) — rotas sob withErrorHandler respondem JSON padronizado.
 * ASSÍNCRONA desde a fatia D do PWA: sempre `await requireRole(...)`.
 */
export async function requireRole(
  request: NextRequest,
  role: JWTPayload['role'],
): Promise<JWTPayload> {
  const payload = await requireSession(request);
  if (payload.role !== role) {
    throw new ApiError(403, 'Acesso negado');
  }
  return payload;
}

/**
 * Painel administrativo (11/09/2026): só `role === 'admin'`. Atalho sobre
 * requireRole para deixar explícito nas rotas /api/admin/**.
 * ASSÍNCRONA: sempre `await requireAdmin(...)`.
 */
export async function requireAdmin(request: NextRequest): Promise<JWTPayload> {
  return requireRole(request, 'admin');
}

export interface AuthWithActingResult {
  payload: JWTPayload;
  targetUserId: string;
  actingClient: Awaited<ReturnType<typeof resolveActingContext>>['actingClient'];
}

export async function requireAuthWithActing(request: NextRequest): Promise<AuthWithActingResult> {
  const payload = await requireSession(request);
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
