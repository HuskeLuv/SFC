import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../transactions/route';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  stock: { findUnique: vi.fn() },
  stockTransaction: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
  portfolio: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
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

const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/stocks/transactions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const createGetRequest = () =>
  new NextRequest('http://localhost/api/stocks/transactions', {
    method: 'GET',
  });

describe('/api/stocks/transactions', () => {
  const mockUser = { id: 'user-123', email: 'test@test.com', name: 'Test' };
  const mockStock = { id: 'stock-1', ticker: 'PETR4', companyName: 'Petrobras' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.stock.findUnique.mockResolvedValue(mockStock);
  });

  describe('POST - Criar transacao', () => {
    it('cria transacao de compra com sucesso', async () => {
      const transaction = {
        id: 'tx-1',
        userId: 'user-123',
        stockId: 'stock-1',
        type: 'compra',
        quantity: 100,
        price: 35.5,
        total: 3550,
        date: '2024-06-15T00:00:00.000Z',
        fees: 10,
        notes: null,
        stock: mockStock,
      };
      mockPrisma.stockTransaction.create.mockResolvedValue(transaction);
      mockPrisma.portfolio.findUnique.mockResolvedValue(null);
      mockPrisma.portfolio.create.mockResolvedValue({});

      const response = await POST(
        createPostRequest({
          stockId: 'stock-1',
          type: 'compra',
          quantity: 100,
          price: 35.5,
          date: '2024-06-15',
          fees: 10,
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.type).toBe('compra');
      expect(mockPrisma.stockTransaction.create).toHaveBeenCalled();
      expect(mockPrisma.portfolio.create).toHaveBeenCalled();
    });

    it('cria transacao de venda com sucesso', async () => {
      const transaction = {
        id: 'tx-2',
        userId: 'user-123',
        stockId: 'stock-1',
        type: 'venda',
        quantity: 50,
        price: 40.0,
        total: 2000,
        date: '2024-07-15T00:00:00.000Z',
        fees: 5,
        notes: null,
        stock: mockStock,
      };
      mockPrisma.stockTransaction.create.mockResolvedValue(transaction);
      mockPrisma.portfolio.findUnique.mockResolvedValue({
        userId: 'user-123',
        stockId: 'stock-1',
        quantity: 100,
        avgPrice: 35.5,
        totalInvested: 3550,
      });
      mockPrisma.portfolio.update.mockResolvedValue({});

      const response = await POST(
        createPostRequest({
          stockId: 'stock-1',
          type: 'venda',
          quantity: 50,
          price: 40.0,
          date: '2024-07-15',
          fees: 5,
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.type).toBe('venda');
    });

    it('retorna 400 para tipo invalido (nao compra/venda)', async () => {
      const response = await POST(
        createPostRequest({
          stockId: 'stock-1',
          type: 'troca',
          quantity: 100,
          price: 35.5,
          date: '2024-06-15',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('type');
    });

    it('retorna 400 para quantidade negativa', async () => {
      const response = await POST(
        createPostRequest({
          stockId: 'stock-1',
          type: 'compra',
          quantity: -10,
          price: 35.5,
          date: '2024-06-15',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('quantity');
    });

    it('retorna 400 para preco negativo', async () => {
      const response = await POST(
        createPostRequest({
          stockId: 'stock-1',
          type: 'compra',
          quantity: 100,
          price: -5,
          date: '2024-06-15',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('price');
    });

    it('retorna 401 quando nao autenticado', async () => {
      mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));

      const response = await POST(
        createPostRequest({
          stockId: 'stock-1',
          type: 'compra',
          quantity: 100,
          price: 35.5,
          date: '2024-06-15',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Não autorizado');
    });

    it('retorna 404 quando ativo nao encontrado', async () => {
      mockPrisma.stock.findUnique.mockResolvedValue(null);

      const response = await POST(
        createPostRequest({
          stockId: 'stock-inexistente',
          type: 'compra',
          quantity: 100,
          price: 35.5,
          date: '2024-06-15',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('Ativo não encontrado');
    });
  });

  describe('GET - Listar transacoes', () => {
    it('lista transacoes do usuario', async () => {
      const transactions = [
        {
          id: 'tx-1',
          type: 'compra',
          quantity: 100,
          price: 35.5,
          stock: mockStock,
        },
        {
          id: 'tx-2',
          type: 'venda',
          quantity: 50,
          price: 40,
          stock: mockStock,
        },
      ];
      mockPrisma.stockTransaction.findMany.mockResolvedValue(transactions);

      const response = await GET(createGetRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(2);
      expect(mockPrisma.stockTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123' },
        }),
      );
    });

    it('retorna 401 quando nao autenticado', async () => {
      mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));

      const response = await GET(createGetRequest());
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Não autorizado');
    });
  });

  describe('GET - Paginação', () => {
    const mockTransactions = [
      { id: 'tx-1', type: 'compra', quantity: 100, price: 35.5, stock: mockStock },
      { id: 'tx-2', type: 'venda', quantity: 50, price: 40, stock: mockStock },
      { id: 'tx-3', type: 'compra', quantity: 200, price: 30, stock: mockStock },
      { id: 'tx-4', type: 'compra', quantity: 150, price: 32, stock: mockStock },
      { id: 'tx-5', type: 'venda', quantity: 80, price: 38, stock: mockStock },
    ];

    it('retorna formato original sem parâmetros de paginação', async () => {
      mockPrisma.stockTransaction.findMany.mockResolvedValue(mockTransactions);

      const response = await GET(createGetRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(5);
      expect(mockPrisma.stockTransaction.count).not.toHaveBeenCalled();
    });

    it('retorna formato paginado com page e limit', async () => {
      mockPrisma.stockTransaction.count.mockResolvedValue(5);
      mockPrisma.stockTransaction.findMany.mockResolvedValue(mockTransactions.slice(0, 2));

      const request = new NextRequest('http://localhost/api/stocks/transactions?page=1&limit=2', {
        method: 'GET',
      });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(2);
      expect(data.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 5,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: false,
      });
    });

    it('retorna data vazio quando página excede total', async () => {
      mockPrisma.stockTransaction.count.mockResolvedValue(5);
      mockPrisma.stockTransaction.findMany.mockResolvedValue([]);

      const request = new NextRequest(
        'http://localhost/api/stocks/transactions?page=999&limit=10',
        { method: 'GET' },
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual([]);
      expect(data.pagination.hasNextPage).toBe(false);
      expect(data.pagination.page).toBe(999);
      expect(data.pagination.total).toBe(5);
    });
  });
});
