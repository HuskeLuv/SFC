import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  portfolio: { findMany: vi.fn(), findUnique: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  dashboardData: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  fixedIncomeAsset: { findMany: vi.fn().mockResolvedValue([]) },
  economicIndex: { findMany: vi.fn().mockResolvedValue([]) },
  tesouroDiretoPrice: { findMany: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from '../route';

const createGetRequest = () =>
  new NextRequest('http://localhost/api/carteira/fim-fia', { method: 'GET' });

const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/fim-fia', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('/api/carteira/fim-fia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
  });

  describe('GET', () => {
    it('returns 401 without auth', async () => {
      const { requireAuthWithActing } = await import('@/utils/auth');
      vi.mocked(requireAuthWithActing).mockRejectedValueOnce(new Error('Não autorizado'));
      const res = await GET(createGetRequest());
      expect(res.status).toBe(401);
    });

    it('returns data with correct shape when no portfolio items', async () => {
      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toHaveProperty('resumo');
      expect(data).toHaveProperty('secoes');
      expect(data).toHaveProperty('totalGeral');
      expect(Array.isArray(data.secoes)).toBe(true);
    });

    it('returns 404 when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const res = await GET(createGetRequest());
      expect(res.status).toBe(404);
    });

    it('uses Asset.currentPrice * quantity when CVM cota is synced', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'pf-1',
          assetId: 'asset-fund-1',
          quantity: 100,
          avgPrice: 5, // cost basis - should be ignored when currentPrice exists
          totalInvested: 500,
          objetivo: 0,
          asset: {
            id: 'asset-fund-1',
            type: 'fund',
            name: 'Fundo Multi XP',
            currentPrice: { toNumber: () => 7.5 },
          },
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      const ativo = data.secoes.flatMap((s: { ativos: unknown[] }) => s.ativos)[0];
      expect(ativo.valorAtualizado).toBe(750); // 7.5 * 100
      expect(ativo.isAutoUpdated).toBe(true);
    });
  });

  describe('POST', () => {
    it('updates caixa para investir', async () => {
      mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
      mockPrisma.dashboardData.create.mockResolvedValue({});
      const res = await POST(createPostRequest({ caixaParaInvestir: 1200 }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('rejects manual valorAtualizado edit when CVM cota is synced', async () => {
      mockPrisma.portfolio.findUnique.mockResolvedValue({
        id: 'pf-1',
        userId: 'user-1',
        quantity: 100,
        asset: { type: 'fund', currentPrice: { toNumber: () => 7.5 } },
      });
      const res = await POST(
        createPostRequest({ ativoId: 'pf-1', campo: 'valorAtualizado', valor: 9999 }),
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toMatch(/cota CVM/);
    });
  });
});
