import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { ApiError } from '@/utils/apiErrorHandler';

const mockAssertSessionVersion = vi.hoisted(() => vi.fn());
const mockResolveActingContext = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/sessionVersion', () => ({
  assertSessionVersion: mockAssertSessionVersion,
}));
vi.mock('@/utils/consultantActing', () => ({
  resolveActingContext: mockResolveActingContext,
}));

import { requireAdmin, requireAuthWithActing, requireRole, requireSession } from '../auth';

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
});

const request = (claims?: Record<string, unknown>) => {
  const headers: Record<string, string> = {};
  if (claims) {
    headers.cookie = `token=${jwt.sign(claims, process.env.JWT_SECRET!, { expiresIn: 3600 })}`;
  }
  return new NextRequest('http://localhost/api/x', { headers });
};

const revoked = () =>
  mockAssertSessionVersion.mockRejectedValue(new ApiError(401, 'Sessão expirada'));

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertSessionVersion.mockResolvedValue(undefined);
  mockResolveActingContext.mockResolvedValue({ targetUserId: 'u1', actingClient: null });
});

describe('requireSession', () => {
  it('sem token: Não autorizado, sem consultar o banco', async () => {
    await expect(requireSession(request())).rejects.toThrow('Não autorizado');
    expect(mockAssertSessionVersion).not.toHaveBeenCalled();
  });

  it('confere o sessionVersion do token', async () => {
    const payload = await requireSession(request({ id: 'u1', role: 'user', sv: 2 }));
    expect(payload).toMatchObject({ id: 'u1', sv: 2 });
    expect(mockAssertSessionVersion).toHaveBeenCalledWith(expect.objectContaining({ sv: 2 }));
  });

  it('sessão revogada → 401', async () => {
    revoked();
    await expect(requireSession(request({ id: 'u1', role: 'user' }))).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

describe('requireRole / requireAdmin (assíncronos)', () => {
  it('admin com sessão válida passa', async () => {
    await expect(requireAdmin(request({ id: 'a1', role: 'admin' }))).resolves.toMatchObject({
      id: 'a1',
    });
  });

  it('role errada → 403', async () => {
    await expect(requireAdmin(request({ id: 'u1', role: 'user' }))).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('admin com sessão revogada → 401 (não 403 nem acesso)', async () => {
    revoked();
    await expect(requireAdmin(request({ id: 'a1', role: 'admin' }))).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('consultor com sessão revogada → 401', async () => {
    revoked();
    await expect(
      requireRole(request({ id: 'c1', role: 'consultant' }), 'consultant'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('requireAuthWithActing', () => {
  it('sessão revogada → 401 antes de resolver a personificação', async () => {
    revoked();
    await expect(requireAuthWithActing(request({ id: 'u1', role: 'user' }))).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockResolveActingContext).not.toHaveBeenCalled();
  });

  it('sessão válida devolve o contexto', async () => {
    const out = await requireAuthWithActing(request({ id: 'u1', role: 'user' }));
    expect(out).toMatchObject({ targetUserId: 'u1', actingClient: null });
  });
});
