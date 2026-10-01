import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  // Histórico de alterações (recordChange importa prisma como default export).
  userChangeLog: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
  user: { findUnique: vi.fn() },
  portfolio: { findMany: vi.fn() },
  dashboardData: {
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    create: vi.fn(),
  },
  // Caixa para Investir grava dentro de transação (serviço caixaParaInvestir).
  $transaction: vi.fn(),
  // Ativos planejados (sem posição): nenhum nos cenários destes testes.
  watchlist: { findMany: vi.fn().mockResolvedValue([]) },
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

import { GET, POST } from '../route';

/** Evento de mover (UserChangeLog) que tirou o item da aba base. */
const eventoMover = (entityId: string, after: Record<string, unknown>, viaConsultant = false) => ({
  entityId,
  action: 'investimento.mover',
  createdAt: new Date('2026-10-01T12:00:00Z'),
  viaConsultant,
  snapshot: { v: 1, kind: 'mover', data: { categoriaOverride: null }, meta: { after } },
});

type Linha = {
  id: string;
  ticker?: string;
  nome?: string;
  cotacaoAtual?: number;
  valorAtualizado: number;
  movido?: boolean;
  movidoEm?: string;
  movidoViaConsultor?: boolean;
  naoMovivelMotivo?: string;
  planejado?: boolean;
};
type Secao = { ativos: Linha[] } & Record<string, unknown>;
const linhas = (data: { secoes: Secao[] }) => data.secoes.flatMap((s) => s.ativos);

const createGetRequest = () =>
  new NextRequest('http://localhost/api/carteira/acoes', { method: 'GET' });

const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/acoes', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('/api/carteira/acoes', () => {
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
      expect(data.secoes).toEqual([]);
      expect(data.totalGeral.valorAplicado).toBe(0);
    });

    it('returns sections with portfolio data', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 'user-1',
          quantity: 10,
          totalInvested: 500,
          avgPrice: 50,
          objetivo: 20,
          estrategia: 'value',
          stockId: 's1',
          asset: { symbol: 'PETR4', name: 'Petrobras', type: 'stock' },
          lastUpdate: new Date(),
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.secoes.length).toBeGreaterThan(0);
      expect(data.secoes[0].ativos[0].ticker).toBe('PETR4');
    });

    it('regression (phase C): BDR armazenado via assetId aparece na tabela de ações', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p-bdr',
          userId: 'user-1',
          quantity: 5,
          totalInvested: 250,
          avgPrice: 50,
          objetivo: 10,
          estrategia: 'growth',
          stockId: null,
          stock: null,
          assetId: 'a-bdr',
          asset: { symbol: 'AAPL34', name: 'Apple BDR', type: 'bdr', currency: 'BRL' },
          lastUpdate: new Date(),
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);

      const allAtivos = data.secoes.flatMap(
        (s: { ativos: Array<{ ticker: string; nome: string }> }) => s.ativos,
      );
      expect(allAtivos).toHaveLength(1);
      expect(allAtivos[0].ticker).toBe('AAPL34');
      expect(allAtivos[0].nome).toBe('Apple BDR');

      // Base da aba (sem override) continua stock/bdr/brd; + ramo do override.
      expect(mockPrisma.portfolio.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            OR: expect.arrayContaining([
              { categoriaOverride: 'acoes' },
              { categoriaOverride: null, asset: { type: { in: ['stock', 'bdr', 'brd'] } } },
            ]),
          },
        }),
      );
    });

    it('não inclui FIIs (ticker terminando em 11) na tabela de ações', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p-fii',
          userId: 'user-1',
          quantity: 20,
          totalInvested: 2000,
          avgPrice: 100,
          objetivo: 15,
          estrategia: 'value',
          stockId: 's-fii',
          asset: { symbol: 'KNRI11', name: 'Kinea', type: 'fii' },
          lastUpdate: new Date(),
        },
        {
          id: 'p-acao',
          userId: 'user-1',
          quantity: 30,
          totalInvested: 900,
          avgPrice: 30,
          objetivo: 15,
          estrategia: 'value',
          stockId: 's-acao',
          asset: { symbol: 'VALE3', name: 'Vale', type: 'stock' },
          lastUpdate: new Date(),
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);

      const tickers = data.secoes.flatMap((s: { ativos: Array<{ ticker: string }> }) =>
        s.ativos.map((a) => a.ticker),
      );
      expect(tickers).toContain('VALE3');
      expect(tickers).not.toContain('KNRI11');
    });
  });

  describe('mover na Carteira (out/2026)', () => {
    const posicao = (over: Record<string, unknown>) => ({
      userId: 'user-1',
      quantity: 10,
      totalInvested: 1000,
      avgPrice: 100,
      objetivo: 0,
      estrategia: null,
      tipoFii: null,
      categoriaOverride: null,
      lastUpdate: new Date(),
      ...over,
    });

    it('FII movido para Ações aparece na seção da estratégia, com cotação live e selo', async () => {
      const { getAssetPrices } = await import('@/services/pricing/assetPriceService');
      vi.mocked(getAssetPrices).mockResolvedValueOnce(new Map([['KDIF11', 130]]));
      mockPrisma.portfolio.findMany.mockResolvedValue([
        posicao({
          id: 'p-kdif',
          assetId: 'a-kdif',
          categoriaOverride: 'acoes',
          estrategia: 'growth',
          tipoFii: 'tvm',
          asset: { symbol: 'KDIF11', name: 'Kinea Infra', type: 'fii', currency: 'BRL' },
        }),
      ]);
      mockPrisma.userChangeLog.findMany.mockResolvedValueOnce([
        eventoMover('p-kdif', { categoriaOverride: 'acoes', estrategia: 'growth' }, true),
      ]);

      const data = await (await GET(createGetRequest())).json();

      expect(vi.mocked(getAssetPrices).mock.calls[0][0]).toContain('KDIF11');
      const growth = data.secoes.find((s: Secao) => s.estrategia === 'growth');
      expect(growth.ativos).toHaveLength(1);
      const [kdif] = growth.ativos as Linha[];
      expect(kdif.ticker).toBe('KDIF11');
      expect(kdif.cotacaoAtual).toBe(130);
      expect(kdif.valorAtualizado).toBe(1300);
      expect(kdif.movido).toBe(true);
      expect(kdif.movidoEm).toBe('2026-10-01T12:00:00.000Z');
      expect(kdif.movidoViaConsultor).toBe(true);
    });

    it('ação movida para outra aba some de Ações', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        posicao({
          id: 'p-petr',
          categoriaOverride: 'fiis',
          asset: { symbol: 'PETR4', name: 'Petrobras', type: 'stock', currency: 'BRL' },
        }),
        posicao({
          id: 'p-vale',
          asset: { symbol: 'VALE3', name: 'Vale', type: 'stock', currency: 'BRL' },
        }),
      ]);
      const data = await (await GET(createGetRequest())).json();
      expect(linhas(data).map((l) => l.ticker)).toEqual(['VALE3']);
    });

    it('sem override: linha igual à de antes (sem selo) e o histórico nem é lido', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        posicao({
          id: 'p-vale',
          estrategia: 'risk',
          asset: { symbol: 'VALE3', name: 'Vale', type: 'stock', currency: 'BRL' },
        }),
      ]);
      const data = await (await GET(createGetRequest())).json();
      const [vale] = linhas(data);
      expect(data.secoes.map((s: Secao) => s.estrategia)).toEqual(['risk']);
      expect(vale).not.toHaveProperty('movido');
      expect(vale).not.toHaveProperty('naoMovivelMotivo');
      expect(vale.valorAtualizado).toBe(1000);
      expect(mockPrisma.userChangeLog.findMany).not.toHaveBeenCalled();
    });

    it('override inválido ou igual à aba base é ignorado (item fica na base)', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        posicao({
          id: 'p-vale',
          categoriaOverride: 'acoes',
          asset: { symbol: 'VALE3', name: 'Vale', type: 'stock', currency: 'BRL' },
        }),
        posicao({
          id: 'p-itub',
          categoriaOverride: 'lixo',
          asset: { symbol: 'ITUB4', name: 'Itaú', type: 'stock', currency: 'BRL' },
        }),
      ]);
      const data = await (await GET(createGetRequest())).json();
      const rows = linhas(data);
      expect(rows.map((l) => l.ticker).sort()).toEqual(['ITUB4', 'VALE3']);
      expect(rows.every((l) => l.movido === undefined)).toBe(true);
    });

    it('planejado movido para Ações entra na seção escolhida', async () => {
      mockPrisma.watchlist.findMany.mockResolvedValueOnce([
        {
          id: 'w-hglg',
          userId: 'user-1',
          assetId: 'a-hglg',
          objetivo: 5,
          secao: 'risk',
          categoriaOverride: 'acoes',
          notes: null,
          addedAt: new Date(),
          asset: { id: 'a-hglg', symbol: 'HGLG11', name: 'CSHG Log', type: 'fii', currency: 'BRL' },
        },
      ]);
      const data = await (await GET(createGetRequest())).json();
      const risk = data.secoes.find((s: Secao) => s.estrategia === 'risk');
      expect(risk.ativos).toEqual([
        expect.objectContaining({ id: 'w-hglg', planejado: true, objetivo: 5 }),
      ]);
    });
  });

  describe('POST', () => {
    it('updates caixa para investir', async () => {
      // Reserva da aba precisa caber no caixa total (bolso total com reservas).
      mockPrisma.dashboardData.findMany.mockResolvedValueOnce([
        { metric: 'caixa_para_investir_consolidado', value: 10000 },
      ]);
      mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
      mockPrisma.dashboardData.create.mockResolvedValue({});
      const res = await POST(createPostRequest({ caixaParaInvestir: 1000 }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockPrisma.dashboardData.create).toHaveBeenCalled();
    });

    // Bolso total com reservas por aba (17/09/2026): a reserva da aba precisa
    // caber no caixa total.
    it('recusa com 409 quando a reserva não cabe no caixa total', async () => {
      mockPrisma.dashboardData.findMany.mockResolvedValueOnce([
        { metric: 'caixa_para_investir_consolidado', value: 5000 },
        { metric: 'caixa_para_investir_fii', value: 2000 },
      ]);
      const res = await POST(createPostRequest({ caixaParaInvestir: 4000 }));
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.code).toBe('RESERVA_EXCEDE_TOTAL');
      expect(data.maximoAba).toBe(3000);
      expect(data.totalNecessario).toBe(6000);
      expect(mockPrisma.dashboardData.create).not.toHaveBeenCalled();
      expect(mockPrisma.dashboardData.update).not.toHaveBeenCalled();
    });

    it('com ajustarTotal grava a reserva e sobe o total junto', async () => {
      mockPrisma.dashboardData.findMany.mockResolvedValueOnce([
        { metric: 'caixa_para_investir_consolidado', value: 5000 },
        { metric: 'caixa_para_investir_fii', value: 2000 },
      ]);
      mockPrisma.dashboardData.findFirst.mockImplementation(
        async ({ where }: { where: { metric: string } }) =>
          where.metric === 'caixa_para_investir_consolidado' ? { id: 'total', value: 5000 } : null,
      );
      const res = await POST(createPostRequest({ caixaParaInvestir: 4000, ajustarTotal: true }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.caixaTotal).toBe(6000);
      expect(mockPrisma.dashboardData.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', metric: 'caixa_para_investir_acoes', value: 4000 },
      });
      expect(mockPrisma.dashboardData.update).toHaveBeenCalledWith({
        where: { id: 'total' },
        data: { value: 6000 },
      });
      mockPrisma.dashboardData.findFirst.mockReset();
    });
  });
});
