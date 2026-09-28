import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@/utils/apiErrorHandler';

const mockPrisma = vi.hoisted(() => ({
  userChangeLog: { create: vi.fn() },
}));
const mockRequireSession = vi.hoisted(() => vi.fn());
const mockBumpSessionVersion = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ default: mockPrisma, prisma: mockPrisma }));
vi.mock('@/utils/auth', () => ({ requireSession: mockRequireSession }));
vi.mock('@/lib/auth/sessionVersion', () => ({ bumpSessionVersion: mockBumpSessionVersion }));

import { DELETE } from '../route';

const request = () => new NextRequest('http://localhost/api/profile/sessoes', { method: 'DELETE' });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue({ id: 'user-1', email: 'u@t.com', role: 'user', sv: 0 });
  mockBumpSessionVersion.mockResolvedValue(1);
  mockPrisma.userChangeLog.create.mockResolvedValue({});
});

describe('DELETE /api/profile/sessoes', () => {
  it('incrementa o sessionVersion, limpa o cookie e o cache do navegador', async () => {
    const res = await DELETE(request());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockBumpSessionVersion).toHaveBeenCalledWith('user-1');
    expect(res.headers.get('set-cookie')).toMatch(/token=;.*Max-Age=0/);
    expect(res.headers.get('clear-site-data')).toBe('"cache"');
  });

  it('registra no histórico de alterações', async () => {
    await DELETE(request());
    expect(mockPrisma.userChangeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        section: 'perfil',
        action: 'sessoes.encerrar',
      }),
    });
  });

  it('sem sessão válida → 401 e nada muda', async () => {
    mockRequireSession.mockRejectedValue(new ApiError(401, 'Sessão expirada'));
    const res = await DELETE(request());
    expect(res.status).toBe(401);
    expect(mockBumpSessionVersion).not.toHaveBeenCalled();
  });
});
