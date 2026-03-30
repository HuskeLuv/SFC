import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  portfolio: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
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

import { PATCH, DELETE } from '../route';

const createPatchRequest = (body: object) =>
  new NextRequest('http://localhost/api/historico/transacao/tx-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const createDeleteRequest = () =>
  new NextRequest('http://localhost/api/historico/transacao/tx-1', { method: 'DELETE' });

const callPATCH = (body: object, id = 'tx-1') =>
  PATCH(createPatchRequest(body), { params: Promise.resolve({ id }) });

const callDELETE = (id = 'tx-1') =>
  DELETE(createDeleteRequest(), { params: Promise.resolve({ id }) });

describe('PATCH /api/historico/transacao/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
  });

  it('atualiza transação com sucesso', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      userId: 'user-1',
      assetId: 'asset-1',
      stockId: null,
      type: 'compra',
      quantity: 10,
      price: 25,
      total: 250,
      asset: { symbol: 'PETR4' },
      stock: null,
    });
    mockPrisma.stockTransaction.update.mockResolvedValue({});
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      { type: 'compra', quantity: 20, price: 25, total: 500 },
    ]);
    mockPrisma.portfolio.update.mockResolvedValue({});

    const response = await callPATCH({ quantity: 20, price: 25, total: 500 });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.stockTransaction.update).toHaveBeenCalled();
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValue(
      Object.assign(new Error('Não autorizado'), { status: 401 }),
    );

    const response = await callPATCH({ quantity: 10 });
    expect(response.status).toBe(401);
  });

  it('retorna 404 quando transação não encontrada', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(null);

    const response = await callPATCH({ quantity: 10 });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Transação não encontrada');
  });

  it('retorna erro de validação com dados inválidos', async () => {
    const response = await callPATCH({ quantity: 'abc' });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });
});

describe('DELETE /api/historico/transacao/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
  });

  it('remove transação com sucesso', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      userId: 'user-1',
      assetId: 'asset-1',
      stockId: null,
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });
    mockPrisma.stockTransaction.delete.mockResolvedValue({});
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      { type: 'compra', quantity: 10, price: 25, total: 250 },
    ]);
    mockPrisma.portfolio.update.mockResolvedValue({});

    const response = await callDELETE();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.stockTransaction.delete).toHaveBeenCalledWith({ where: { id: 'tx-1' } });
  });

  it('retorna 404 quando transação não encontrada', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(null);

    const response = await callDELETE();
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Transação não encontrada');
  });
});
