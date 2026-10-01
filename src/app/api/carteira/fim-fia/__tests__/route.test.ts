import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  // Histórico de alterações (recordChange importa prisma como default export).
  userChangeLog: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
  user: { findUnique: vi.fn() },
  portfolio: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  // Ativos planejados (sem posição): nenhum nos cenários destes testes.
  watchlist: { findMany: vi.fn().mockResolvedValue([]) },
  stockTransaction: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  dashboardData: {
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    create: vi.fn(),
  },
  // Caixa para Investir grava dentro de transação (serviço caixaParaInvestir).
  $transaction: vi.fn(),
  fixedIncomeAsset: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
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

mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => unknown) =>
  fn(mockPrisma),
);

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetPrices: vi.fn().mockResolvedValue(new Map()),
}));

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

  describe('GET — prazo de resgate (ticket 02/09/2026)', () => {
    const portfolioFundo = {
      id: 'pf-liq',
      assetId: 'asset-liq',
      quantity: 1,
      avgPrice: 1000,
      totalInvested: 1000,
      objetivo: 0,
      asset: { id: 'asset-liq', type: 'multimercado', name: 'Fundo X', currentPrice: null },
    };

    it('sem prazo informado devolve vazio (não mais "D+0/Imediata")', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([portfolioFundo]);
      const res = await GET(createGetRequest());
      const ativo = (await res.json()).secoes.flatMap((s: { ativos: unknown[] }) => s.ativos)[0];
      expect(ativo.cotizacaoResgate).toBe('');
      expect(ativo.liquidacaoResgate).toBe('');
    });

    it('resolve cada campo pela compra mais recente que o tenha (aporte não apaga)', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([portfolioFundo]);
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        {
          assetId: 'asset-liq',
          type: 'compra',
          total: 500,
          date: new Date('2026-08-01'),
          notes: JSON.stringify({ operation: { action: 'aporte' } }),
        },
        {
          assetId: 'asset-liq',
          type: 'compra',
          total: 1000,
          date: new Date('2026-01-10'),
          notes: JSON.stringify({ cotizacaoResgate: 'D+30', liquidacaoResgate: 'D+2' }),
        },
      ]);
      const res = await GET(createGetRequest());
      const ativo = (await res.json()).secoes.flatMap((s: { ativos: unknown[] }) => s.ativos)[0];
      expect(ativo.cotizacaoResgate).toBe('D+30');
      expect(ativo.liquidacaoResgate).toBe('D+2');
    });
  });

  describe('mover na Carteira (out/2026)', () => {
    type Linha = {
      id: string;
      nome: string;
      tipo: string;
      valorAtualizado: number;
      isAutoUpdated: boolean;
      movido?: boolean;
      movidoEm?: string;
    };
    type Secao = { tipo: string; ativos: Linha[] };
    const posicao = (over: Record<string, unknown>) => ({
      userId: 'user-1',
      quantity: 10,
      totalInvested: 1000,
      avgPrice: 100,
      objetivo: 0,
      tipoFundo: null,
      categoriaOverride: null,
      lastUpdate: new Date(),
      ...over,
    });

    it('FII movido para Fundos: seção do tipoFundo, valor pela cotação de bolsa e selo', async () => {
      const { getAssetPrices } = await import('@/services/pricing/assetPriceService');
      vi.mocked(getAssetPrices).mockResolvedValueOnce(new Map([['KDIF11', 130]]));
      mockPrisma.portfolio.findMany.mockResolvedValue([
        posicao({
          id: 'p-kdif',
          assetId: 'a-kdif',
          categoriaOverride: 'fimFia',
          tipoFundo: 'fip-infra',
          tipoFii: 'tvm',
          asset: {
            symbol: 'KDIF11',
            name: 'Kinea Infra',
            type: 'fii',
            currency: 'BRL',
            currentPrice: null,
          },
        }),
      ]);
      mockPrisma.userChangeLog.findMany.mockResolvedValueOnce([
        {
          entityId: 'p-kdif',
          action: 'investimento.mover',
          createdAt: new Date('2026-10-01T12:00:00Z'),
          viaConsultant: false,
          snapshot: {
            v: 1,
            kind: 'mover',
            data: { categoriaOverride: null, tipoFii: 'tvm' },
            meta: { after: { categoriaOverride: 'fimFia', tipoFundo: 'fip-infra' } },
          },
        },
      ]);
      const data = await (await GET(createGetRequest())).json();
      expect(vi.mocked(getAssetPrices).mock.calls[0][0]).toEqual(['KDIF11']);
      const secao = data.secoes.find((s: Secao) => s.tipo === 'fip-infra');
      expect(secao.ativos).toHaveLength(1);
      expect(secao.ativos[0]).toMatchObject({
        nome: 'Kinea Infra',
        ticker: 'KDIF11',
        valorAtualizado: 1300,
        isAutoUpdated: true,
        movido: true,
        movidoEm: '2026-10-01T12:00:00.000Z',
      });
    });

    it('sem cotação de bolsa, o FII movido cai na cascata de sempre (avgPrice)', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        posicao({
          id: 'p-kdif',
          assetId: 'a-kdif',
          categoriaOverride: 'fimFia',
          tipoFundo: 'fip-infra',
          asset: { symbol: 'KDIF11', name: 'Kinea Infra', type: 'fii', currentPrice: null },
        }),
      ]);
      const data = await (await GET(createGetRequest())).json();
      const [linha] = data.secoes.flatMap((s: Secao) => s.ativos);
      expect(linha.valorAtualizado).toBe(1000);
      expect(linha.isAutoUpdated).toBe(false);
    });

    it('fundo movido para outra aba some de Fundos; fundo CVM não consulta cotação', async () => {
      const { getAssetPrices } = await import('@/services/pricing/assetPriceService');
      mockPrisma.portfolio.findMany.mockResolvedValue([
        posicao({
          id: 'p-legado',
          assetId: 'a-legado',
          categoriaOverride: 'fiis',
          asset: { symbol: 'HGLG11', name: 'CSHG Log', type: 'fund', currentPrice: null },
        }),
        posicao({
          id: 'p-cvm',
          assetId: 'a-cvm',
          asset: {
            symbol: 'CVM-123',
            name: 'Fundo FIA',
            type: 'fia',
            currentPrice: { toNumber: () => 150 },
          },
        }),
      ]);
      const data = await (await GET(createGetRequest())).json();
      const rows = data.secoes.flatMap((s: Secao) => s.ativos);
      expect(rows.map((r: Linha) => r.id)).toEqual(['p-cvm']);
      expect(rows[0].valorAtualizado).toBe(1500);
      expect(rows[0]).not.toHaveProperty('movido');
      expect(getAssetPrices).not.toHaveBeenCalled();
    });

    it('Portfolio.tipoFundo (escolhido no mover) vence o Asset.type e as notes', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        posicao({
          id: 'p-fia',
          assetId: 'a-fia',
          tipoFundo: 'fidc',
          asset: { symbol: 'CVM-9', name: 'Fundo FIA', type: 'fia', currentPrice: null },
        }),
      ]);
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        {
          assetId: 'a-fia',
          type: 'compra',
          total: 1000,
          notes: JSON.stringify({ tipoFundo: 'fim' }),
        },
      ]);
      const data = await (await GET(createGetRequest())).json();
      const fidc = data.secoes.find((s: Secao) => s.tipo === 'fidc');
      expect(fidc.ativos.map((a: Linha) => a.id)).toEqual(['p-fia']);
    });
  });

  describe('POST', () => {
    it('grava cotizacaoResgate nas notes da compra mais recente', async () => {
      mockPrisma.portfolio.findUnique.mockResolvedValue({
        id: 'pf-liq',
        userId: 'user-1',
        assetId: 'asset-liq',
        quantity: 1,
        avgPrice: 1000,
        asset: { id: 'asset-liq', type: 'multimercado', name: 'Fundo X', currentPrice: null },
      });
      mockPrisma.stockTransaction.findFirst.mockResolvedValue({
        id: 'tx-1',
        date: new Date('2026-01-10'),
        notes: JSON.stringify({ operation: { action: 'compra' }, cotizacaoResgate: 'D+0' }),
      });
      mockPrisma.stockTransaction.update.mockResolvedValue({});
      const res = await POST(
        createPostRequest({ ativoId: 'pf-liq', campo: 'cotizacaoResgate', valor: ' D+30 ' }),
      );
      expect(res.status).toBe(200);
      const call = mockPrisma.stockTransaction.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'tx-1' });
      expect(JSON.parse(call.data.notes)).toEqual({
        operation: { action: 'compra' },
        cotizacaoResgate: 'D+30',
      });
    });

    it('rejeita prazo de resgate que não seja texto', async () => {
      mockPrisma.portfolio.findUnique.mockResolvedValue({
        id: 'pf-liq',
        userId: 'user-1',
        assetId: 'asset-liq',
        asset: { id: 'asset-liq', type: 'multimercado', currentPrice: null },
      });
      const res = await POST(
        createPostRequest({ ativoId: 'pf-liq', campo: 'liquidacaoResgate', valor: 5 }),
      );
      expect(res.status).toBe(400);
    });

    it('updates caixa para investir', async () => {
      // Reserva da aba precisa caber no caixa total (bolso total com reservas).
      mockPrisma.dashboardData.findMany.mockResolvedValueOnce([
        { metric: 'caixa_para_investir_consolidado', value: 10000 },
      ]);
      mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
      mockPrisma.dashboardData.create.mockResolvedValue({});
      const res = await POST(createPostRequest({ caixaParaInvestir: 1200 }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('mover: recusa valorAtualizado de ativo com cotação em bolsa (não corrompe o preço médio)', async () => {
      mockPrisma.portfolio.findUnique.mockResolvedValue({
        id: 'pf-kdif',
        userId: 'user-1',
        assetId: 'a-kdif',
        quantity: 10,
        avgPrice: 100,
        categoriaOverride: 'fimFia',
        asset: {
          symbol: 'KDIF11',
          name: 'Kinea Infra',
          type: 'fii',
          currency: 'BRL',
          currentPrice: null,
        },
      });
      mockPrisma.fixedIncomeAsset.findUnique.mockResolvedValue(null);
      const res = await POST(
        createPostRequest({ ativoId: 'pf-kdif', campo: 'valorAtualizado', valor: 5000 }),
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toBe(
        'Este ativo tem cotação em bolsa; o valor é atualizado automaticamente',
      );
      expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
    });

    it('fundo CVM sem cota segue editável (a trava é só para ticker de bolsa)', async () => {
      mockPrisma.portfolio.findUnique.mockResolvedValue({
        id: 'pf-cvm',
        userId: 'user-1',
        assetId: 'a-cvm',
        quantity: 1,
        avgPrice: 1000,
        asset: { symbol: 'CVM-123', name: 'Fundo X', type: 'multimercado', currentPrice: null },
      });
      mockPrisma.portfolio.update.mockResolvedValue({});
      const res = await POST(
        createPostRequest({ ativoId: 'pf-cvm', campo: 'valorAtualizado', valor: 1100 }),
      );
      expect(res.status).toBe(200);
      expect(mockPrisma.portfolio.update).toHaveBeenCalled();
      expect(mockPrisma.fixedIncomeAsset.findUnique).not.toHaveBeenCalled();
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
