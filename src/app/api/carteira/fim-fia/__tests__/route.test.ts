import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  // Histórico de alterações (recordChange importa prisma como default export).
  userChangeLog: { create: vi.fn() },
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

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

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

    // Fixes: categoria/subcategoria vêm da classificação CVM (Asset), e
    // quantoFalta/necessidadeAporte são calculados no servidor (paridade ações).
    it('popula categoria/subcategoria da CVM e calcula quantoFalta', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'pf-1',
          assetId: 'asset-fund-1',
          quantity: 100,
          avgPrice: 5,
          totalInvested: 500,
          objetivo: 80,
          asset: {
            id: 'asset-fund-1',
            type: 'fund',
            name: 'Fundo Multi XP',
            currentPrice: { toNumber: () => 7.5 },
            categoria: 'Fundo Multimercado',
            subcategoria: 'Multimercado Macro',
          },
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      const ativo = data.secoes.flatMap((s: { ativos: unknown[] }) => s.ativos)[0];
      // Fix #2: classificação CVM populada
      expect(ativo.categoriaNivel1).toBe('Fundo Multimercado');
      expect(ativo.subcategoriaNivel2).toBe('Multimercado Macro');
      // Fix #1: quantoFalta = objetivo - %carteira (100% num fundo só) = 80 - 100
      expect(ativo.quantoFalta).toBe(-20);
    });

    // Ticket 02/09/2026: fundo de renda fixa (classificação CVM) caía em FIM.
    it('fundo CVM type=fund-rf vai pra seção "Renda Fixa" da aba Fundos', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'pf-rf',
          assetId: 'asset-rf',
          quantity: 10,
          avgPrice: 100,
          totalInvested: 1000,
          objetivo: 0,
          asset: {
            id: 'asset-rf',
            type: 'fund-rf',
            name: 'AZ QUEST VALORE FIF RENDA FIXA',
            currentPrice: { toNumber: () => 120 },
            categoria: 'Classes de Cotas de Fundos FIF',
            subcategoria: 'Renda Fixa',
          },
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      const secaoRf = data.secoes.find((s: { tipo: string }) => s.tipo === 'rf');
      const secaoFim = data.secoes.find((s: { tipo: string }) => s.tipo === 'fim');
      expect(secaoRf?.nome).toBe('Renda Fixa');
      expect(secaoRf?.ativos).toHaveLength(1);
      expect(secaoRf.ativos[0].tipo).toBe('rf');
      expect(secaoFim?.ativos).toHaveLength(0);
    });

    it('fundo manual (type=fund) respeita o subtipo escolhido no wizard (notes.tipoFundo)', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'pf-manual',
          assetId: 'asset-manual',
          quantity: 1,
          avgPrice: 1000,
          totalInvested: 1000,
          objetivo: 0,
          asset: {
            id: 'asset-manual',
            type: 'fund',
            name: 'Fundo Ações Manual',
            currentPrice: null,
          },
        },
      ]);
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        {
          assetId: 'asset-manual',
          type: 'compra',
          total: 1000,
          date: new Date('2026-01-10'),
          notes: JSON.stringify({ tipoFundo: 'fia', operation: { action: 'compra' } }),
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      const secaoFia = data.secoes.find((s: { tipo: string }) => s.tipo === 'fia');
      expect(secaoFia?.ativos).toHaveLength(1);
      expect(secaoFia.ativos[0].tipo).toBe('fia');
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
