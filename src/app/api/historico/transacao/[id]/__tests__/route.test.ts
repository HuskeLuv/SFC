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
  fixedIncomeAsset: { updateMany: vi.fn(), deleteMany: vi.fn() },
  // Bug #04: recalc consulta Asset pra eventualmente regenerar o name de RF.
  asset: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn().mockResolvedValue({}) },
  // Bug #02: recalc apaga snapshots/performance quando recomputeSnapshotsFrom é passado.
  portfolioDailySnapshot: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  portfolioPerformance: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  // Histórico de alterações (recordChange importa prisma como default export).
  userChangeLog: { create: vi.fn().mockResolvedValue({}) },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

const mockDeleteTtlCache = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/lib/simpleTtlCache', () => ({ deleteTtlCacheKeyPrefix: mockDeleteTtlCache }));

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
      date: new Date('2024-01-15'),
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
      { type: 'compra', quantity: 20, price: 25, total: 500, date: new Date('2024-01-15') },
    ]);
    mockPrisma.portfolio.update.mockResolvedValue({});

    const response = await callPATCH({ quantity: 20, price: 25, total: 500 });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.stockTransaction.update).toHaveBeenCalled();

    // Histórico de alterações: edição com sucesso registra transacao.editar.
    expect(mockPrisma.userChangeLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.userChangeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          section: 'carteira',
          action: 'transacao.editar',
          entity: 'transacao',
          entityId: 'tx-1',
          entityLabel: 'PETR4',
          changes: expect.arrayContaining([
            expect.objectContaining({ field: 'quantity', before: 10, after: 20 }),
          ]),
        }),
      }),
    );
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
    // Sem mutação, nada entra no histórico de alterações.
    expect(mockPrisma.userChangeLog.create).not.toHaveBeenCalled();
  });

  it('retorna erro de validação com dados inválidos', async () => {
    const response = await callPATCH({ quantity: 'abc' });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('recalcula total ao editar apenas quantity', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      userId: 'user-1',
      assetId: 'asset-1',
      stockId: null,
      date: new Date('2024-01-15'),
      type: 'compra',
      quantity: 100,
      price: 10,
      total: 1000,
      asset: { symbol: 'PETR4' },
      stock: null,
    });
    mockPrisma.stockTransaction.update.mockResolvedValue({});
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      { type: 'compra', quantity: 50, price: 10, total: 500, date: new Date('2024-01-15') },
    ]);
    mockPrisma.portfolio.update.mockResolvedValue({});

    const response = await callPATCH({ quantity: 50 });
    expect(response.status).toBe(200);

    expect(mockPrisma.stockTransaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: { quantity: 50, total: 500 },
    });
    expect(mockPrisma.portfolio.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantity: 50,
          avgPrice: 10,
          totalInvested: 500,
        }),
      }),
    );
  });

  it('recalcula total ao editar apenas price', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      userId: 'user-1',
      assetId: 'asset-1',
      stockId: null,
      date: new Date('2024-01-15'),
      type: 'compra',
      quantity: 100,
      price: 10,
      total: 1000,
      asset: { symbol: 'PETR4' },
      stock: null,
    });
    mockPrisma.stockTransaction.update.mockResolvedValue({});
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      { type: 'compra', quantity: 100, price: 8, total: 800, date: new Date('2024-01-15') },
    ]);
    mockPrisma.portfolio.update.mockResolvedValue({});

    const response = await callPATCH({ price: 8 });
    expect(response.status).toBe(200);

    expect(mockPrisma.stockTransaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: { price: 8, total: 800 },
    });
  });

  it('recalcula price ao editar apenas total', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      userId: 'user-1',
      assetId: 'asset-1',
      stockId: null,
      date: new Date('2024-01-15'),
      type: 'compra',
      quantity: 100,
      price: 10,
      total: 1000,
      asset: { symbol: 'PETR4' },
      stock: null,
    });
    mockPrisma.stockTransaction.update.mockResolvedValue({});
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      { type: 'compra', quantity: 100, price: 7.5, total: 750, date: new Date('2024-01-15') },
    ]);
    mockPrisma.portfolio.update.mockResolvedValue({});

    const response = await callPATCH({ total: 750 });
    expect(response.status).toBe(200);

    expect(mockPrisma.stockTransaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: { total: 750, price: 7.5 },
    });
  });

  it('preserva avgPrice ao recalcular após venda parcial (custo médio proporcional)', async () => {
    // Cenário: compra 100 @ 10, vende 50 @ 15. avgPrice deve seguir 10 (não 5).
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      id: 'tx-buy',
      userId: 'user-1',
      assetId: 'asset-1',
      stockId: null,
      date: new Date('2024-01-15'),
      type: 'compra',
      quantity: 100,
      price: 10,
      total: 1000,
      asset: { symbol: 'PETR4' },
      stock: null,
    });
    mockPrisma.stockTransaction.update.mockResolvedValue({});
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      { type: 'compra', quantity: 100, price: 10, total: 1000, date: new Date('2025-01-01') },
      { type: 'venda', quantity: 50, price: 15, total: 750, date: new Date('2025-02-01') },
    ]);
    mockPrisma.portfolio.update.mockResolvedValue({});

    await callPATCH({ price: 10 });

    expect(mockPrisma.portfolio.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantity: 50,
          avgPrice: 10, // mantém custo de aquisição, não vira 5
          totalInvested: 500,
        }),
      }),
    );
  });

  it('atualiza avgPrice quando edita compra após venda', async () => {
    // Cenário: usuário tinha compra 100 @ 10 e venda 50 @ 15.
    // Edita o total da compra para 1500 (preço 15). Esperado:
    //   - 100 @ 15 (custo 1500), avg=15
    //   - venda 50 a custo 15 → totalInvested=750, qty=50, avg=15
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      id: 'tx-buy',
      userId: 'user-1',
      assetId: 'asset-1',
      stockId: null,
      date: new Date('2024-01-15'),
      type: 'compra',
      quantity: 100,
      price: 10,
      total: 1000,
      asset: { symbol: 'PETR4' },
      stock: null,
    });
    mockPrisma.stockTransaction.update.mockResolvedValue({});
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      { type: 'compra', quantity: 100, price: 15, total: 1500, date: new Date('2025-01-01') },
      { type: 'venda', quantity: 50, price: 15, total: 750, date: new Date('2025-02-01') },
    ]);
    mockPrisma.portfolio.update.mockResolvedValue({});

    await callPATCH({ total: 1500 });

    expect(mockPrisma.portfolio.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantity: 50,
          avgPrice: 15,
          totalInvested: 750,
        }),
      }),
    );
  });

  it('não mexe em quantity/price/total quando só edita date', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      userId: 'user-1',
      assetId: 'asset-1',
      stockId: null,
      date: new Date('2024-01-15'),
      type: 'compra',
      quantity: 100,
      price: 10,
      total: 1000,
      asset: { symbol: 'PETR4' },
      stock: null,
    });
    mockPrisma.stockTransaction.update.mockResolvedValue({});
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      { type: 'compra', quantity: 100, price: 10, total: 1000, date: new Date('2024-01-15') },
    ]);
    mockPrisma.portfolio.update.mockResolvedValue({});

    const response = await callPATCH({ date: '2025-01-15' });
    expect(response.status).toBe(200);

    const updateCall = mockPrisma.stockTransaction.update.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty('quantity');
    expect(updateCall.data).not.toHaveProperty('price');
    expect(updateCall.data).not.toHaveProperty('total');
    expect(updateCall.data.date).toBeInstanceOf(Date);
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
      date: new Date('2024-01-15'),
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });
    mockPrisma.stockTransaction.delete.mockResolvedValue({});
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      { type: 'compra', quantity: 10, price: 25, total: 250, date: new Date('2024-01-15') },
    ]);
    mockPrisma.portfolio.update.mockResolvedValue({});

    const response = await callDELETE();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.stockTransaction.delete).toHaveBeenCalledWith({ where: { id: 'tx-1' } });
    expect(mockPrisma.userChangeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ section: 'carteira', action: 'transacao.excluir' }),
      }),
    );
  });

  it('retorna 404 quando transação não encontrada', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(null);

    const response = await callDELETE();
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Transação não encontrada');
  });
});
