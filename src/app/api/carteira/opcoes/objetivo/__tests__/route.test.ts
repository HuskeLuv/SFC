import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  // Histórico de alterações (recordChange importa prisma como default export).
  userChangeLog: { create: vi.fn() },
  portfolio: { findFirst: vi.fn(), update: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));

vi.mock('@/services/impersonationLogger', () => ({
  logDataUpdate: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '../route';

const createRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/opcoes/objetivo', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('POST /api/carteira/opcoes/objetivo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'port-1',
      objetivo: 10,
      asset: { symbol: 'ATIVO1', name: 'Ativo Um', source: 'brapi' },
    });
    mockPrisma.portfolio.update.mockResolvedValue({});
  });

  it('atualiza objetivo com sucesso', async () => {
    const response = await POST(
      createRequest({
        ativoId: 'port-1',
        objetivo: 15,
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain('Objetivo atualizado');
    expect(mockPrisma.portfolio.findFirst).toHaveBeenCalledWith({
      where: { id: 'port-1', userId: 'user-1' },
      include: { asset: { select: { symbol: true, name: true, source: true } } },
    });
    expect(mockPrisma.portfolio.update).toHaveBeenCalledWith({
      where: { id: 'port-1' },
      data: { objetivo: 15 },
    });
  });

  it('retorna 400 quando ativoId está ausente', async () => {
    const response = await POST(
      createRequest({
        objetivo: 15,
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('Dados inválidos');
  });

  it('retorna 400 quando objetivo é negativo', async () => {
    const response = await POST(
      createRequest({
        ativoId: 'port-1',
        objetivo: -5,
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('Dados inválidos');
  });

  it('retorna 400 quando objetivo excede 100', async () => {
    const response = await POST(
      createRequest({
        ativoId: 'port-1',
        objetivo: 150,
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('Dados inválidos');
  });

  it('retorna 404 quando ativo não encontrado', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    const response = await POST(
      createRequest({
        ativoId: 'non-existent',
        objetivo: 15,
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(404);
    expect(data.error).toContain('Ativo não encontrado');
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));
    const response = await POST(
      createRequest({
        ativoId: 'port-1',
        objetivo: 15,
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });
});
