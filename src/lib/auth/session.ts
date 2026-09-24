/**
 * Sessão do app (PWA fase 0, 24/09/2026) — emissão do JWT e do cookie `token`.
 *
 * Regras (decisão do Wellington, 23/09/2026):
 * - "Manter conectado" (rm=true): JWT e cookie de 30 dias, renovados em
 *   GET /api/auth/me depois de 1 dia de uso (no máx. 1×/dia), com TETO de 90
 *   dias desde o login (`at`). O teto também limita o `exp`: nenhum token
 *   passa de `at + 90 dias`.
 * - Sem "Manter conectado": cookie de SESSÃO (sem Max-Age nem Expires, sai ao
 *   fechar o navegador), JWT de 12h e nenhuma renovação.
 * - Admin e consultor: 1 dia, sem renovação (com rm, cookie de 1 dia; sem
 *   rm, o mesmo cookie de sessão de 12h dos demais).
 *
 * Claims: `sv` (User.sessionVersion na emissão — revogação), `rm` (manter
 * conectado) e `at` (auth_time, segundos). Tokens antigos, sem esses claims,
 * são normalizados em `normalizeClaims` e continuam válidos.
 *
 * Node only (jsonwebtoken). O middleware Edge só verifica assinatura e exp
 * com jose (HS256), compatível com o que é emitido aqui.
 */
import jwt from 'jsonwebtoken';
import type { NextResponse } from 'next/server';

export const SESSION_COOKIE = 'token';

/** JWT e cookie de quem marcou "Manter conectado". */
export const TTL_REMEMBER_S = 30 * 86400;
/** JWT de quem NÃO marcou "Manter conectado" (cookie de sessão). */
export const TTL_SESSION_S = 12 * 3600;
/** Admin e consultor com "Manter conectado": 1 dia, sem renovação. */
export const TTL_PRIVILEGED_S = 86400;
/** Teto absoluto desde o login para quem renova (usuário comum). */
export const ABSOLUTE_MAX_S = 90 * 86400;
/** Idade mínima do token (desde o `iat`) para renovar: no máximo 1×/dia (decisão 23/09). */
export const RENEW_AFTER_S = 86400;

export type SessionRole = 'user' | 'consultant' | 'admin';

export interface SessionClaims {
  id: string;
  role: SessionRole;
  /** User.sessionVersion no momento da emissão. */
  sv: number;
  /** "Manter conectado". */
  rm: boolean;
  /** auth_time (segundos desde a época) — preservado nas renovações. */
  at: number;
}

/** Payload bruto de um token (novo ou legado). */
export interface RawSessionPayload {
  id: string;
  role: SessionRole;
  sv?: number;
  rm?: boolean;
  at?: number;
  iat?: number;
  exp?: number;
}

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export function isPrivileged(role: SessionRole): boolean {
  return role === 'admin' || role === 'consultant';
}

/** Vida útil de um token recém-emitido, sem considerar o teto. */
function baseTtl(c: Pick<SessionClaims, 'role' | 'rm'>): number {
  if (!c.rm) return TTL_SESSION_S;
  return isPrivileged(c.role) ? TTL_PRIVILEGED_S : TTL_REMEMBER_S;
}

/** Tempo máximo de sessão contado a partir do login (`at`). */
export function sessionLifetimeCap(c: Pick<SessionClaims, 'role' | 'rm'>): number {
  if (!c.rm) return TTL_SESSION_S;
  return isPrivileged(c.role) ? TTL_PRIVILEGED_S : ABSOLUTE_MAX_S;
}

/**
 * Segundos de vida de um token emitido agora para estes claims: a vida útil
 * normal, limitada pelo teto desde o login. 0 = a sessão já passou do teto.
 */
export function sessionTtl(c: SessionClaims, nowS: number = nowSeconds()): number {
  const remaining = c.at + sessionLifetimeCap(c) - nowS;
  return Math.max(0, Math.min(baseTtl(c), remaining));
}

/** Assina o JWT (HS256). `ttlS` padrão = `sessionTtl(c)`. */
export function signSessionToken(c: SessionClaims, ttlS: number = sessionTtl(c)): string {
  return jwt.sign(
    { id: c.id, role: c.role, sv: c.sv, rm: c.rm, at: c.at },
    process.env.JWT_SECRET!,
    {
      expiresIn: ttlS,
    },
  );
}

/**
 * Grava o cookie `token`. Com `rm`, Max-Age = `maxAgeS` (padrão 30 dias).
 * Sem `rm`, cookie de sessão: sem Max-Age nem Expires.
 */
export function setSessionCookie(
  res: NextResponse,
  token: string,
  rm: boolean,
  maxAgeS: number = TTL_REMEMBER_S,
): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(rm ? { maxAge: maxAgeS } : {}),
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

/**
 * Emite token + cookie para os claims (login, renovação e reemissão depois de
 * trocar senha/2FA). Se a sessão já passou do teto, limpa o cookie e devolve
 * false.
 */
export function issueSession(
  res: NextResponse,
  c: SessionClaims,
  nowS: number = nowSeconds(),
): boolean {
  const ttl = sessionTtl(c, nowS);
  if (ttl <= 0) {
    clearSessionCookie(res);
    return false;
  }
  setSessionCookie(res, signSessionToken(c, ttl), c.rm, ttl);
  return true;
}

/**
 * Claims completos a partir de um payload novo ou legado. Tokens anteriores
 * à fatia D não têm sv/rm/at: sv=0, rm deduzido pela duração (o antigo
 * "manter conectado" era de 7 dias, o normal de 1 dia) e at=iat.
 */
export function normalizeClaims(p: RawSessionPayload, nowS: number = nowSeconds()): SessionClaims {
  const iat = p.iat ?? nowS;
  const rm = p.rm ?? (p.exp !== undefined && p.exp - iat > 86400);
  return {
    id: p.id,
    role: p.role,
    sv: p.sv ?? 0,
    rm,
    at: p.at ?? iat,
  };
}

/**
 * Renovação deslizante: só com "Manter conectado", só para usuário comum
 * (admin/consultor nunca renovam), só depois de 12h desde a última emissão e
 * só enquanto o teto de 90 dias desde o login não foi atingido.
 */
export function shouldRenew(c: SessionClaims, iat: number, nowS: number = nowSeconds()): boolean {
  if (!c.rm || isPrivileged(c.role)) return false;
  if (nowS - iat < RENEW_AFTER_S) return false;
  return nowS - c.at < ABSOLUTE_MAX_S;
}
