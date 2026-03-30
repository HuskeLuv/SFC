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

import { PATCH } from '../route';

const createPatchRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/reserva/valor-atualizado', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('PATCH /api/carteira/reserva/valor-atualizado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
  });

  it('atualiza valor da reserva com sucesso', async () => {
    mockPrisma.portfolio.findUnique.mockResolvedValue({
      id: 'port-1',
      userId: 'user-1',
      quantity: 1,
      asset: { type: 'emergency', symbol: 'RESERVA-EMERG' },
    });
    mockPrisma.portfolio.update.mockResolvedValue({});

    const response = await PATCH(
      createPatchRequest({ portfolioId: 'port-1', valorAtualizado: 15000 }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.portfolio.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'port-1' },
        data: expect.objectContaining({ totalInvested: 15000 }),
      }),
    );
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValue(
      Object.assign(new Error('Não autorizado'), { status: 401 }),
    );

    const response = await PATCH(
      createPatchRequest({ portfolioId: 'port-1', valorAtualizado: 15000 }),
    );
    expect(response.status).toBe(401);
  });

  it('retorna erro de validação com dados inválidos', async () => {
    const response = await PATCH(createPatchRequest({ portfolioId: '', valorAtualizado: -50 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });
});
