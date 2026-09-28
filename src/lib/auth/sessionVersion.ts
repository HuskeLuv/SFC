/**
 * Revogação de sessões por User.sessionVersion (PWA fase 0, 24/09/2026).
 *
 * Todo JWT carrega o `sv` do momento da emissão. Incrementar a coluna
 * (troca de senha, 2FA, exclusão de conta, "Sair de todos os dispositivos")
 * derruba os tokens antigos em TODAS as rotas autenticadas, via
 * `requireSession` / `requireAuthWithActing` em `@/utils/auth`.
 *
 * Cache em memória com TTL de 60s (prod = instância única): a revogação vale
 * em até 60s nas outras sessões e na hora nesta instância, porque o bump
 * atualiza o cache.
 */
import prisma from '@/lib/prisma';
import { ApiError } from '@/utils/apiErrorHandler';

export const SESSION_VERSION_CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 5_000;

const cache = new Map<string, { value: number | null; expiresAt: number }>();

function remember(userId: string, value: number | null): void {
  if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
  cache.set(userId, { value, expiresAt: Date.now() + SESSION_VERSION_CACHE_TTL_MS });
}

/** sessionVersion atual do usuário; null se o usuário não existe. */
export async function getSessionVersion(userId: string): Promise<number | null> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true },
  });
  const value = user ? user.sessionVersion : null;
  remember(userId, value);
  return value;
}

/** Incrementa o sessionVersion (derruba as sessões emitidas antes) e devolve o novo valor. */
export async function bumpSessionVersion(userId: string): Promise<number> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  remember(userId, updated.sessionVersion);
  return updated.sessionVersion;
}

/**
 * Garante que o token ainda vale: usuário existe e o `sv` do token (0 em
 * tokens legados) é o atual. Senão, ApiError(401, 'Sessão expirada').
 */
export async function assertSessionVersion(payload: { id: string; sv?: number }): Promise<void> {
  const current = await getSessionVersion(payload.id);
  if (current === null || (payload.sv ?? 0) !== current) {
    throw new ApiError(401, 'Sessão expirada');
  }
}

/** Só para testes. */
export function resetSessionVersionCache(): void {
  cache.clear();
}
