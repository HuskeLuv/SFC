import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findUnique: vi.fn(), update: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/services/impersonationLogger', () => ({
  logDataUpdate: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '../route';

const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/imoveis-bens/valor-atualizado', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('POST /api/carteira/imoveis-bens/valor-atualizado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
  });

  it('atualiza valor do imóvel com sucesso', async () => {
    mockPrisma.portfolio.findUnique.mockResolvedValue({
      id: 'port-1',
      userId: 'user-1',
      quantity: 1,
      asset: { type: 'imovel' },
    });
    mockPrisma.portfolio.update.mockResolvedValue({});

    const response = await POST(createPostRequest({ portfolioId: 'port-1', novoValor: 500000 }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.portfolio.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'port-1' },
        data: expect.objectContaining({ totalInvested: 500000 }),
      }),
    );
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValue(
      Object.assign(new Error('Não autorizado'), { status: 401 }),
    );

    const response = await POST(createPostRequest({ portfolioId: 'port-1', novoValor: 500000 }));
    expect(response.status).toBe(401);
  });

  it('retorna erro de validação com dados inválidos', async () => {
    const response = await POST(createPostRequest({ portfolioId: '', novoValor: -100 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });
});
