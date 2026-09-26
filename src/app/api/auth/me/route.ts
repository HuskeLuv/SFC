import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing, type AuthWithActingResult } from '@/utils/auth';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  issueSession,
  normalizeClaims,
  shouldRenew,
} from '@/lib/auth/session';

/** Token ausente, inválido, expirado ou revogado (sessionVersion). */
function isUnauthorized(error: unknown): boolean {
  if (error instanceof ApiError) return error.statusCode === 401;
  return error instanceof Error && error.message === 'Não autorizado';
}

/**
 * GET /api/auth/me — usuário logado + renovação deslizante da sessão.
 *
 * Roda a cada carga do app (AuthContext). Com "Manter conectado", reemite o
 * token depois de 12h (mesmos id/role/sv/rm e o `at` do login), até o teto de
 * 90 dias; admin, consultor e sessões sem "Manter conectado" nunca renovam.
 * A renovação fica aqui (Node + Prisma) e não no middleware Edge porque só
 * aqui dá para checar a revogação antes de estender a sessão.
 *
 * GET idempotente e same-origin (SameSite=Lax), fora do CSRF por estar em
 * /api/auth.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  // Centralizado em requireAuthWithActing (auditoria 29/08/2026, 1.3/2.2):
  // o helper valida o JWT, a revogação e resolve o contexto de impersonation.
  let auth: AuthWithActingResult;
  try {
    auth = await requireAuthWithActing(req);
  } catch (error: unknown) {
    if (!isUnauthorized(error)) throw error;
    const message = error instanceof ApiError ? error.message : 'Não autorizado';
    const response = NextResponse.json({ error: message }, { status: 401 });
    // Token revogado/expirado não serve para nada: limpa o cookie.
    if (req.cookies.has(SESSION_COOKIE)) clearSessionCookie(response);
    return response;
  }
  const { payload, actingClient } = auth;

  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  const response = NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    actingClient,
  });

  const claims = normalizeClaims(payload);
  if (payload.iat !== undefined && shouldRenew(claims, payload.iat)) {
    issueSession(response, claims);
  }
  return response;
});
