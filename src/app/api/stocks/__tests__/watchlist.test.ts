import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../watchlist/route';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  stock: { findUnique: vi.fn() },
  watchlist: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
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
  new NextRequest('http://localhost/api/stocks/watchlist', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const createGetRequest = () =>
  new NextRequest('http://localhost/api/stocks/watchlist', {
    method: 'GET',
  });

describe('/api/stocks/watchlist', () => {
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

  describe('POST - Adicionar ao watchlist', () => {
    it('adiciona ativo ao watchlist com sucesso', async () => {
      mockPrisma.watchlist.findUnique.mockResolvedValue(null); // not yet in watchlist
      const watchlistItem = {
        id: 'wl-1',
        userId: 'user-123',
        stockId: 'stock-1',
        notes: null,
        stock: mockStock,
      };
      mockPrisma.watchlist.create.mockResolvedValue(watchlistItem);

      const response = await POST(
        createPostRequest({
          stockId: 'stock-1',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.stockId).toBe('stock-1');
      expect(mockPrisma.watchlist.create).toHaveBeenCalled();
    });

    it('retorna 400 quando ativo ja esta no watchlist', async () => {
      mockPrisma.watchlist.findUnique.mockResolvedValue({
        id: 'wl-existing',
        userId: 'user-123',
        stockId: 'stock-1',
      });

      const response = await POST(
        createPostRequest({
          stockId: 'stock-1',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('watchlist');
    });

    it('retorna 400 quando stockId ausente', async () => {
      const response = await POST(createPostRequest({}));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('stockId');
    });

    it('retorna 404 quando ativo nao encontrado', async () => {
      mockPrisma.stock.findUnique.mockResolvedValue(null);

      const response = await POST(
        createPostRequest({
          stockId: 'stock-inexistente',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('Ativo não encontrado');
    });

    it('retorna 401 quando nao autenticado', async () => {
      mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));

      const response = await POST(
        createPostRequest({
          stockId: 'stock-1',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Não autorizado');
    });
  });

  describe('GET - Listar watchlist', () => {
    it('lista itens do watchlist', async () => {
      const watchlistItems = [
        { id: 'wl-1', stockId: 'stock-1', stock: mockStock, addedAt: '2024-01-01' },
        {
          id: 'wl-2',
          stockId: 'stock-2',
          stock: { id: 'stock-2', ticker: 'VALE3', companyName: 'Vale' },
          addedAt: '2024-01-02',
        },
      ];
      mockPrisma.watchlist.findMany.mockResolvedValue(watchlistItems);

      const response = await GET(createGetRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(2);
      expect(mockPrisma.watchlist.findMany).toHaveBeenCalledWith(
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
});
