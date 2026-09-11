import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@/utils/apiErrorHandler';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockGetAdminOverview = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAdmin: mockRequireAdmin }));
vi.mock('@/services/admin/overview', () => ({ getAdminOverview: mockGetAdminOverview }));

import { GET } from '../route';

const request = () => new NextRequest('http://localhost/api/admin/overview', { method: 'GET' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/admin/overview', () => {
  it('responde 403 para quem não é admin', async () => {
    mockRequireAdmin.mockImplementation(() => {
      throw new ApiError(403, 'Acesso negado');
    });
    const res = await GET(request());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Acesso negado' });
    expect(mockGetAdminOverview).not.toHaveBeenCalled();
  });

  it('responde 401 sem sessão', async () => {
    mockRequireAdmin.mockImplementation(() => {
      throw new Error('Não autorizado');
    });
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it('devolve a visão consolidada para admin, sem cache', async () => {
    mockRequireAdmin.mockReturnValue({ id: 'admin-1', role: 'admin' });
    mockGetAdminOverview.mockResolvedValue({
      geradoEm: '2026-09-11T12:00:00.000Z',
      usuarios: { total: 3 },
    });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ usuarios: { total: 3 } });
  });
});
