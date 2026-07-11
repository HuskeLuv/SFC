import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAuthAsUser, mockAuthAsConsultant } from '@/test/mocks/auth';

const mockPrisma = vi.hoisted(() => ({
  userChangeLog: {
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
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
  mockPrisma.userChangeLog.groupBy.mockResolvedValue([]);
});

const baseEntry = {
  id: 'log-1',
  userId: 'user-1',
  actorId: 'user-1',
  viaConsultant: false,
  section: 'carteira',
  action: 'transacao.editar',
  entity: 'transacao',
  entityId: 'tx-1',
  entityLabel: 'PETR4',
  changes: [{ field: 'quantity', label: 'Quantidade', before: 100, after: 150 }],
  snapshot: { v: 1, kind: 'transacao', data: { secreto: true } },
  undoneAt: null,
  undoneById: null,
  revertsId: null,
  ipAddress: null,
  userAgent: null,
  createdAt: new Date('2026-07-10T12:00:00Z'),
};

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

  it('anota canUndo e NUNCA expõe o snapshot na resposta', async () => {
    mockPrisma.userChangeLog.findMany.mockResolvedValue([baseEntry]);
    mockPrisma.userChangeLog.count.mockResolvedValue(1);
    mockPrisma.userChangeLog.groupBy.mockResolvedValue([
      { entityId: 'tx-1', _max: { createdAt: baseEntry.createdAt } },
    ]);

    const response = await GET(createRequest());
    const body = await response.json();

    expect(body.data[0].canUndo).toBe(true);
    expect(body.data[0]).not.toHaveProperty('snapshot');
    expect(body.data[0].undoneAt).toBeNull();
  });

  it('entrada desfeita vem com canUndo false e undoneAt preenchido', async () => {
    const undone = { ...baseEntry, undoneAt: new Date('2026-07-10T13:00:00Z') };
    mockPrisma.userChangeLog.findMany.mockResolvedValue([undone]);
    mockPrisma.userChangeLog.count.mockResolvedValue(1);

    const response = await GET(createRequest());
    const body = await response.json();

    expect(body.data[0].canUndo).toBe(false);
    expect(body.data[0].undoneAt).toBeTruthy();
  });

  it('sob impersonation, filtra pelo cliente (targetUserId)', async () => {
    mockRequireAuthWithActing.mockResolvedValue(mockAuthAsConsultant('consultant-1', 'client-1'));

    await GET(createRequest());

    expect(mockPrisma.userChangeLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'client-1' } }),
    );
  });
});
