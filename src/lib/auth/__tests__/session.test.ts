import { describe, it, expect, beforeAll } from 'vitest';
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import {
  ABSOLUTE_MAX_S,
  RENEW_AFTER_S,
  TTL_PRIVILEGED_S,
  TTL_REMEMBER_S,
  TTL_SESSION_S,
  clearSessionCookie,
  issueSession,
  normalizeClaims,
  sessionTtl,
  setSessionCookie,
  shouldRenew,
  signSessionToken,
  type SessionClaims,
} from '../session';

const DAY = 86400;
const HOUR = 3600;
const NOW = 1_800_000_000;

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
});

const claims = (over: Partial<SessionClaims> = {}): SessionClaims => ({
  id: 'user-1',
  role: 'user',
  sv: 0,
  rm: true,
  at: NOW,
  ...over,
});

const decode = (token: string) =>
  jwt.verify(token, process.env.JWT_SECRET!) as Record<string, number | string | boolean>;

describe('constantes', () => {
  it('30 dias com rm, 12h sem, 1 dia para admin/consultor, teto de 90 dias', () => {
    expect(TTL_REMEMBER_S).toBe(30 * DAY);
    expect(TTL_SESSION_S).toBe(12 * HOUR);
    expect(TTL_PRIVILEGED_S).toBe(DAY);
    expect(ABSOLUTE_MAX_S).toBe(90 * DAY);
    expect(RENEW_AFTER_S).toBe(12 * HOUR);
  });
});

describe('signSessionToken', () => {
  it('exp de 30 dias com rm', () => {
    const now = Math.floor(Date.now() / 1000);
    const p = decode(signSessionToken(claims({ at: now })));
    expect(Number(p.exp) - Number(p.iat)).toBe(30 * DAY);
    expect(p).toMatchObject({ id: 'user-1', role: 'user', sv: 0, rm: true, at: now });
  });

  it('exp de 12h sem rm', () => {
    const now = Math.floor(Date.now() / 1000);
    const p = decode(signSessionToken(claims({ at: now, rm: false })));
    expect(Number(p.exp) - Number(p.iat)).toBe(12 * HOUR);
  });

  it('não coloca e-mail no JWT (LGPD)', () => {
    const p = decode(signSessionToken(claims({ at: Math.floor(Date.now() / 1000) })));
    expect(Object.keys(p).sort()).toEqual(['at', 'exp', 'iat', 'id', 'rm', 'role', 'sv']);
  });
});

describe('cookie', () => {
  it('com rm: Max-Age=2592000, httpOnly, lax, path /', () => {
    const res = NextResponse.json({});
    setSessionCookie(res, 'abc', true);
    const header = res.headers.get('set-cookie') ?? '';
    expect(header).toContain('token=abc');
    expect(header).toContain('Max-Age=2592000');
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=lax/i);
    expect(header).toContain('Path=/');
  });

  it('sem rm: cookie de sessão, sem Max-Age nem Expires', () => {
    const res = NextResponse.json({});
    setSessionCookie(res, 'abc', false);
    const header = res.headers.get('set-cookie') ?? '';
    expect(header).toContain('token=abc');
    expect(header).not.toMatch(/Max-Age/i);
    expect(header).not.toMatch(/Expires/i);
  });

  it('clearSessionCookie zera o cookie', () => {
    const res = NextResponse.json({});
    clearSessionCookie(res);
    expect(res.headers.get('set-cookie')).toMatch(/token=;.*Max-Age=0/);
  });
});

describe('sessionTtl / issueSession', () => {
  it('usuário com rm: 30 dias, limitado pelo teto de 90 dias desde o login', () => {
    expect(sessionTtl(claims(), NOW)).toBe(30 * DAY);
    expect(sessionTtl(claims({ at: NOW - 80 * DAY }), NOW)).toBe(10 * DAY);
    expect(sessionTtl(claims({ at: NOW - 91 * DAY }), NOW)).toBe(0);
  });

  it('admin/consultor com rm: 1 dia desde o login', () => {
    expect(sessionTtl(claims({ role: 'admin' }), NOW)).toBe(DAY);
    expect(sessionTtl(claims({ role: 'consultant', at: NOW - 20 * HOUR }), NOW)).toBe(4 * HOUR);
  });

  it('sem rm: 12h desde o login (reemissão não estende)', () => {
    expect(sessionTtl(claims({ rm: false }), NOW)).toBe(12 * HOUR);
    expect(sessionTtl(claims({ rm: false, at: NOW - 10 * HOUR }), NOW)).toBe(2 * HOUR);
  });

  it('issueSession além do teto limpa o cookie', () => {
    const res = NextResponse.json({});
    expect(issueSession(res, claims({ at: NOW - 100 * DAY }), NOW)).toBe(false);
    expect(res.headers.get('set-cookie')).toMatch(/token=;.*Max-Age=0/);
  });

  it('issueSession com rm grava Max-Age = vida restante', () => {
    const now = Math.floor(Date.now() / 1000);
    const res = NextResponse.json({});
    expect(issueSession(res, claims({ at: now - 85 * DAY }), now)).toBe(true);
    expect(res.headers.get('set-cookie')).toContain(`Max-Age=${5 * DAY}`);
  });
});

describe('normalizeClaims', () => {
  it('token legado de 7 dias: sv=0, rm=true, at=iat', () => {
    expect(
      normalizeClaims({ id: 'u', role: 'user', iat: NOW - DAY, exp: NOW + 6 * DAY }, NOW),
    ).toEqual({ id: 'u', role: 'user', sv: 0, rm: true, at: NOW - DAY });
  });

  it('token legado de 1 dia: rm=false', () => {
    expect(normalizeClaims({ id: 'u', role: 'user', iat: NOW, exp: NOW + DAY }, NOW).rm).toBe(
      false,
    );
  });

  it('token novo: mantém sv/rm/at', () => {
    expect(
      normalizeClaims(
        { id: 'u', role: 'admin', sv: 5, rm: false, at: NOW - 3, iat: NOW, exp: NOW + DAY },
        NOW,
      ),
    ).toEqual({ id: 'u', role: 'admin', sv: 5, rm: false, at: NOW - 3 });
  });
});

describe('shouldRenew', () => {
  it('falso antes de 12h, verdadeiro depois', () => {
    expect(shouldRenew(claims({ at: NOW - DAY }), NOW - 11 * HOUR, NOW)).toBe(false);
    expect(shouldRenew(claims({ at: NOW - DAY }), NOW - 12 * HOUR, NOW)).toBe(true);
  });

  it('falso com rm=false', () => {
    expect(shouldRenew(claims({ rm: false, at: NOW - DAY }), NOW - DAY, NOW)).toBe(false);
  });

  it('falso além do teto de 90 dias (usuário)', () => {
    expect(shouldRenew(claims({ at: NOW - 89 * DAY }), NOW - DAY, NOW)).toBe(true);
    expect(shouldRenew(claims({ at: NOW - 90 * DAY }), NOW - DAY, NOW)).toBe(false);
  });

  it('admin e consultor nunca renovam', () => {
    expect(shouldRenew(claims({ role: 'admin', at: NOW - DAY }), NOW - DAY, NOW)).toBe(false);
    expect(shouldRenew(claims({ role: 'consultant', at: NOW - DAY }), NOW - DAY, NOW)).toBe(false);
  });
});
