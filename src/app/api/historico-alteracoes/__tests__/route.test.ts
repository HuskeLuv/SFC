import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAuthAsUser, mockAuthAsConsultant } from '@/test/mocks/auth';

const mockPrisma = vi.hoisted(() => ({
  userChangeLog: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma,
}));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

import { GET } from '../route';

const createRequest = (params?: Record<string, string>) => {
  const url = new URL('http://localhost/api/historico-alteracoes');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url, { method: 'GET' });
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthWithActing.mockResolvedValue(mockAuthAsUser('user-1'));
  mockPrisma.userChangeLog.findMany.mockResolvedValue([]);
  mockPrisma.userChangeLog.count.mockResolvedValue(0);
});

describe('GET /api/historico-alteracoes', () => {
  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));

    const response = await GET(createRequest());
    expect(response.status).toBe(401);
  });

  it('usa paginação padrão (página 1, 50 itens) quando sem parâmetros', async () => {
    const response = await GET(createRequest());
    expect(response.status).toBe(200);

    expect(mockPrisma.userChangeLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 50,
      }),
    );

    const body = await response.json();
    expect(body.pagination).toEqual(expect.objectContaining({ page: 1, limit: 50, total: 0 }));
  });

  it('respeita page/limit explícitos', async () => {
    await GET(createRequest({ page: '3', limit: '10' }));

    expect(mockPrisma.userChangeLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it('filtra por seção válida', async () => {
    await GET(createRequest({ section: 'carteira' }));

    expect(mockPrisma.userChangeLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', section: 'carteira' } }),
    );
  });

  it('retorna 400 para seção inválida', async () => {
    const response = await GET(createRequest({ section: 'invalida' }));
    expect(response.status).toBe(400);
  });

  it('retorna 400 para data inválida em from/to', async () => {
    const response = await GET(createRequest({ from: 'nao-e-data' }));
    expect(response.status).toBe(400);
  });

  it('filtra por intervalo de datas', async () => {
    await GET(createRequest({ from: '2026-01-01', to: '2026-06-30' }));

    expect(mockPrisma.userChangeLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gte: new Date('2026-01-01'), lte: new Date('2026-06-30') },
        }),
      }),
    );
  });

  it('sob impersonation, filtra pelo cliente (targetUserId)', async () => {
    mockRequireAuthWithActing.mockResolvedValue(mockAuthAsConsultant('consultant-1', 'client-1'));

    await GET(createRequest());

    expect(mockPrisma.userChangeLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'client-1' } }),
    );
  });
});
