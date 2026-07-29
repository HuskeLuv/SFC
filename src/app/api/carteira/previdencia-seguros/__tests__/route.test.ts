import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  // Histórico de alterações (recordChange importa prisma como default export).
  userChangeLog: { create: vi.fn() },
  user: { findUnique: vi.fn() },
  portfolio: { findMany: vi.fn() },
  dashboardData: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
}));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { GET, POST } from '../route';

const createGetRequest = () =>
  new NextRequest('http://localhost/api/carteira/previdencia-seguros', { method: 'GET' });

const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/previdencia-seguros', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('/api/carteira/previdencia-seguros', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
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
      expect(data).toHaveProperty('alocacaoAtivo');
      expect(data).toHaveProperty('tabelaAuxiliar');
      expect(Array.isArray(data.secoes)).toBe(true);
      expect(data.totalGeral.valorAplicado).toBe(0);
    });

    it('filters portfolio by asset.type in (previdencia, insurance)', async () => {
      await GET(createGetRequest());
      expect(mockPrisma.portfolio.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            asset: { type: { in: ['previdencia', 'insurance'] } },
          }),
        }),
      );
    });

    it('returns previdencia assets in a section (regression: bug #1 + #2)', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 'user-1',
          quantity: 10,
          avgPrice: 150,
          totalInvested: 1500,
          objetivo: 5,
          assetId: 'a1',
          stockId: null,
          stock: null,
          asset: {
            id: 'a1',
            symbol: 'PREVIDENCIA-MINHA-VGBL-123',
            name: 'Minha Previdência VGBL',
            type: 'previdencia',
            currency: 'BRL',
            source: 'manual',
          },
          lastUpdate: new Date(),
        },
      ]);

      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);

      const allAtivos = data.secoes.flatMap(
        (s: { ativos: Array<{ id: string; nome: string }> }) => s.ativos,
      );
      expect(allAtivos).toHaveLength(1);
      expect(allAtivos[0].id).toBe('p1');
      expect(allAtivos[0].nome).toBe('Minha Previdência VGBL');
      expect(data.totalGeral.valorAplicado).toBe(1500);
    });

    it('classifica por origem: previdência (fundos) primeiro, seguros (insurance) depois', async () => {
      const base = {
        userId: 'user-1',
        quantity: 1,
        avgPrice: 1000,
        totalInvested: 1000,
        objetivo: 0,
        lastUpdate: new Date(),
      };
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          ...base,
          id: 'p-prev',
          assetId: 'a-prev',
          asset: {
            id: 'a-prev',
            symbol: 'BRASILPREV-XYZ',
            name: 'Brasilprev RT FIX',
            type: 'previdencia',
            currency: 'BRL',
            source: 'cvm',
            currentPrice: null,
          },
        },
        {
          ...base,
          id: 'p-seg',
          assetId: 'a-seg',
          asset: {
            id: 'a-seg',
            symbol: 'SEGURO-VIDA-123',
            name: 'Seguro de Vida Resgatável',
            type: 'insurance',
            currency: 'BRL',
            source: 'manual',
            currentPrice: null,
          },
        },
      ]);

      const res = await GET(createGetRequest());
      const data = await res.json();

      expect(data.secoes.map((s: { tipo: string }) => s.tipo)).toEqual([
        'growth_fundos_prev',
        'seguro',
      ]);
      const [prev, seg] = data.secoes;
      expect(prev.ativos.map((a: { id: string }) => a.id)).toEqual(['p-prev']);
      expect(prev.ativos[0].modalidade).toBe('previdencia');
      expect(seg.ativos.map((a: { id: string }) => a.id)).toEqual(['p-seg']);
      expect(seg.ativos[0].modalidade).toBe('vida');
    });

    it('fundo de previdência com cota CVM sincronizada usa currentPrice no valor atualizado', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p-cvm',
          userId: 'user-1',
          quantity: 100,
          avgPrice: 10,
          totalInvested: 1000,
          objetivo: 0,
          assetId: 'a-cvm',
          lastUpdate: new Date(),
          asset: {
            id: 'a-cvm',
            symbol: 'PREV-CVM-1',
            name: 'XP Icatu Prev FIM',
            type: 'previdencia',
            currency: 'BRL',
            source: 'cvm',
            currentPrice: { toNumber: () => 12.5 },
          },
        },
      ]);

      const res = await GET(createGetRequest());
      const data = await res.json();
      const ativo = data.secoes.flatMap((s: { ativos: unknown[] }) => s.ativos)[0] as {
        valorAtualizado: number;
        cotacaoAtual: number;
        rentabilidade: number;
      };
      expect(ativo.valorAtualizado).toBeCloseTo(1250, 2);
      expect(ativo.cotacaoAtual).toBeCloseTo(12.5, 2);
      expect(ativo.rentabilidade).toBeCloseTo(25, 2);
    });

    it('includes caixa para investir in valorAtualizado', async () => {
      mockPrisma.dashboardData.findFirst.mockResolvedValue({
        id: 'd1',
        userId: 'user-1',
        metric: 'caixa_para_investir_previdencia_seguros',
        value: 2500,
      });

      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(data.resumo.caixaParaInvestir).toBe(2500);
      expect(data.resumo.valorAtualizado).toBe(2500);
      expect(data.totalGeral.valorAtualizado).toBe(2500);
    });
  });

  describe('POST', () => {
    it('creates caixa para investir when none exists', async () => {
      mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
      mockPrisma.dashboardData.create.mockResolvedValue({});
      const res = await POST(createPostRequest({ caixaParaInvestir: 3000 }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockPrisma.dashboardData.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            metric: 'caixa_para_investir_previdencia_seguros',
            value: 3000,
          }),
        }),
      );
    });

    it('rejects negative caixa', async () => {
      const res = await POST(createPostRequest({ caixaParaInvestir: -10 }));
      expect(res.status).toBe(400);
    });
  });
});
