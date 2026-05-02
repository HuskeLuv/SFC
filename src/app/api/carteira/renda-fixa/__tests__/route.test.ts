import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  portfolio: { findMany: vi.fn(), findUnique: vi.fn() },
  fixedIncomeAsset: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  dashboardData: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  economicIndex: { findMany: vi.fn() },
  tesouroDiretoPrice: { findMany: vi.fn() },
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
  new NextRequest('http://localhost/api/carteira/renda-fixa', { method: 'GET' });

const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/renda-fixa', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('/api/carteira/renda-fixa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
    mockPrisma.economicIndex.findMany.mockResolvedValue([]);
    mockPrisma.tesouroDiretoPrice.findMany.mockResolvedValue([]);
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
      expect(data.secoes).toEqual([]);
    });

    it('returns correct totalGeral shape', async () => {
      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.totalGeral).toHaveProperty('valorAplicado');
      expect(data.totalGeral).toHaveProperty('valorAtualizado');
      expect(data.totalGeral).toHaveProperty('rentabilidade');
    });

    it('includes tesouro-direto in the asset.type filter', async () => {
      await GET(createGetRequest());
      expect(mockPrisma.portfolio.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            asset: expect.objectContaining({
              type: { in: ['bond', 'cash', 'tesouro-direto'] },
            }),
          }),
        }),
      );
    });

    it('marks pre-fixed CDB to curve and exposes isAutoUpdated', async () => {
      const startDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000); // ~200 dias atrás
      const maturityDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'pf-cdb',
          assetId: 'asset-cdb',
          quantity: 1,
          avgPrice: 1000, // edição manual antiga - deve ser ignorada quando curva cresce
          totalInvested: 1000,
          asset: { id: 'asset-cdb', type: 'bond', name: 'CDB Pré 12%', currentPrice: null },
        },
      ]);
      mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([
        {
          id: 'fi-cdb',
          assetId: 'asset-cdb',
          type: 'CDB_PRE',
          description: 'CDB Pré 12%',
          startDate,
          maturityDate,
          investedAmount: 1000,
          annualRate: 12, // 12% a.a. - cresce sem precisar de série CDI
          indexer: 'PRE',
          indexerPercent: null,
          liquidityType: null,
          taxExempt: false,
          tesouroBondType: null,
          tesouroMaturity: null,
        },
      ]);

      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      const ativo = data.secoes.flatMap((s: { ativos: unknown[] }) => s.ativos)[0] as {
        valorAtualizado: number;
        isAutoUpdated: boolean;
      };
      expect(ativo.isAutoUpdated).toBe(true);
      expect(ativo.valorAtualizado).toBeGreaterThan(1000);
      // ~200 dias úteis a 12% a.a. ≈ ~10% crescimento → valor entre 1050 e 1130
      expect(ativo.valorAtualizado).toBeLessThan(1150);
    });

    it('expoe MTM negativo no Tesouro Direto via FixedIncomeAsset quando o PU caiu', async () => {
      // Cliente comprou Tesouro IPCA+ 2050 por R$ 1000 (1 cota a PU 1000).
      // Hoje, com juros futuros em alta, o PU caiu pra 800. O sistema deve
      // mostrar 800, NÃO 1000 (não pode esconder a perda do cliente).
      const tesouroAssetId = 'asset-td-ipca-2050';
      const startDate = new Date(Date.UTC(2025, 0, 1)); // qua 01/jan/2025 (dia útil)
      const maturityDate = new Date(Date.UTC(2050, 0, 1));
      // PU recente: 30 dias atrás. shiftToBusinessDay garante que cai em dia útil.
      const recentPuDate = new Date();
      recentPuDate.setUTCHours(0, 0, 0, 0);
      recentPuDate.setUTCDate(recentPuDate.getUTCDate() - 30);
      // Garante dia útil (UTC): se sáb/dom, recua até sexta.
      while (recentPuDate.getUTCDay() === 0 || recentPuDate.getUTCDay() === 6) {
        recentPuDate.setUTCDate(recentPuDate.getUTCDate() - 1);
      }

      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'pf-tdi',
          assetId: tesouroAssetId,
          quantity: 1,
          avgPrice: 1000,
          totalInvested: 1000,
          asset: {
            id: tesouroAssetId,
            type: 'tesouro-direto',
            name: 'Tesouro IPCA+ 2050',
            currentPrice: null, // sem catálogo → cai pra curva via PU
          },
        },
      ]);
      mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([
        {
          id: 'fi-tdi',
          assetId: tesouroAssetId,
          type: 'CDB_PRE',
          description: 'Tesouro IPCA+ 2050',
          startDate,
          maturityDate,
          investedAmount: 1000,
          qty: 1, // 1 cota → tesouroPUAtStart = investedAmount/qty = 1000
          annualRate: 6,
          indexer: 'IPCA',
          indexerPercent: null,
          liquidityType: null,
          taxExempt: false,
          tesouroBondType: 'Tesouro IPCA+',
          tesouroMaturity: maturityDate,
        },
      ]);
      mockPrisma.tesouroDiretoPrice.findMany.mockResolvedValue([
        { basePU: 1000, baseDate: startDate, bondType: 'Tesouro IPCA+', maturityDate },
        { basePU: 800, baseDate: recentPuDate, bondType: 'Tesouro IPCA+', maturityDate },
      ]);

      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      const ativo = data.secoes.flatMap((s: { ativos: unknown[] }) => s.ativos)[0] as {
        valorAtualizado: number;
        isAutoUpdated: boolean;
      };
      // PU caiu 20% → valor atual deve ser ~800, NÃO o investedAmount 1000.
      expect(ativo.valorAtualizado).toBeCloseTo(800, 0);
      expect(ativo.valorAtualizado).toBeLessThan(1000);
      expect(ativo.isAutoUpdated).toBe(true);
    });

    it('mantem floor na curva pra CDB (emissao bancaria nao tem MTM negativo)', async () => {
      // CDB com indexer CDI mas sem série de taxa disponível (cold-start) — o
      // valorCalculado fica em ≈ investedAmount. Como NÃO é Tesouro, o sistema
      // deve cair pra avgPrice*quantity (sanity check), não exibir o cálculo
      // degenerado da curva.
      const startDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
      const maturityDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'pf-cdb-noseries',
          assetId: 'asset-cdb-noseries',
          quantity: 1,
          avgPrice: 1050, // valor "editado" pelo cliente
          totalInvested: 1000,
          asset: {
            id: 'asset-cdb-noseries',
            type: 'bond',
            name: 'CDB 100% CDI',
            currentPrice: null,
          },
        },
      ]);
      mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([
        {
          id: 'fi-cdb-noseries',
          assetId: 'asset-cdb-noseries',
          type: 'CDB_POS',
          description: 'CDB 100% CDI',
          startDate,
          maturityDate,
          investedAmount: 1000,
          annualRate: 0,
          indexer: 'CDI',
          indexerPercent: 100,
          liquidityType: null,
          taxExempt: false,
          tesouroBondType: null, // emissão bancária — floor permanece
          tesouroMaturity: null,
        },
      ]);
      // Sem cdi rows nem tesouro rows → curva fica em fator 1 (degenerada).

      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      const ativo = data.secoes.flatMap((s: { ativos: unknown[] }) => s.ativos)[0] as {
        valorAtualizado: number;
      };
      // Cai pra avgPrice*quantity = 1050, não pra curva degenerada (= 1000).
      expect(ativo.valorAtualizado).toBe(1050);
    });

    it('uses Asset.currentPrice * quantity for catalog tesouro valuation', async () => {
      const tesouroAssetId = 'asset-td-1';
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'pf-1',
          assetId: tesouroAssetId,
          quantity: 10,
          avgPrice: 100, // cost basis — should NOT be used since currentPrice exists
          totalInvested: 1000,
          asset: {
            id: tesouroAssetId,
            type: 'tesouro-direto',
            name: 'Tesouro Selic 2029',
            currentPrice: { toNumber: () => 150 },
          },
        },
      ]);
      mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([
        {
          id: 'fi-1',
          assetId: tesouroAssetId,
          type: 'CDB_PRE',
          description: 'Tesouro Selic 2029',
          startDate: new Date('2024-01-01'),
          maturityDate: new Date('2029-03-01'),
          investedAmount: 1000,
          annualRate: 0,
          indexer: 'CDI',
          indexerPercent: 100,
          liquidityType: null,
          taxExempt: true,
          tesouroBondType: 'Tesouro Selic',
          tesouroMaturity: new Date('2029-03-01'),
        },
      ]);

      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      // 150 * 10 = 1500 (currentPrice path), not 100 * 10 = 1000 (avgPrice path)
      expect(data.totalGeral.valorAtualizado).toBe(1500);
      // The asset is flagged as auto-updated so the UI can disable manual editing
      const tesouroAtivo = data.secoes.flatMap((s: { ativos: unknown[] }) => s.ativos)[0];
      expect(tesouroAtivo.isAutoUpdated).toBe(true);
    });
  });

  describe('POST', () => {
    it('updates caixa para investir', async () => {
      mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
      mockPrisma.dashboardData.create.mockResolvedValue({});
      const res = await POST(createPostRequest({ caixaParaInvestir: 2000 }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('rejects manual valorAtualizado edit on tesouro-direto catalog assets', async () => {
      mockPrisma.portfolio.findUnique.mockResolvedValue({
        id: 'pf-1',
        userId: 'user-1',
        assetId: 'asset-td-1',
        asset: { type: 'tesouro-direto' },
      });
      const res = await POST(
        createPostRequest({ ativoId: 'pf-1', campo: 'valorAtualizado', valor: 9999 }),
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toMatch(/Tesouro Direto/);
    });
  });
});
