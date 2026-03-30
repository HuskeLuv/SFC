import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));

const mockRequireAuth = vi.hoisted(() =>
  vi.fn().mockReturnValue({ id: 'user-123', email: 'test@test.com', role: 'user' }),
);

const mockGetUserCashflowStructure = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({
  requireAuth: mockRequireAuth,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));

vi.mock('@/utils/cashflowSetup', () => ({
  getUserCashflowStructure: mockGetUserCashflowStructure,
}));

const createRequest = () => {
  const url = new URL('http://localhost/api/cashflow/structure');
  return new NextRequest(url, { method: 'GET' });
};

describe('GET /api/cashflow/structure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockReturnValue({ id: 'user-123', email: 'test@test.com', role: 'user' });
  });

  it('retorna estrutura do cashflow do usuario', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123', email: 'test@test.com' });
    const mockStructure = {
      groups: [
        { id: 'g1', name: 'Receitas', type: 'entrada', items: [], children: [] },
        { id: 'g2', name: 'Despesas', type: 'saida', items: [], children: [] },
      ],
    };
    mockGetUserCashflowStructure.mockResolvedValue(mockStructure);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.groups).toHaveLength(2);
    expect(mockGetUserCashflowStructure).toHaveBeenCalledWith('user-123');
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockRequireAuth.mockImplementation(() => {
      throw new Error('Não autorizado');
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });

  it('retorna estrutura vazia quando usuario nao tem grupos', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123', email: 'test@test.com' });
    mockGetUserCashflowStructure.mockResolvedValue({ groups: [] });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.groups).toHaveLength(0);
  });
});
