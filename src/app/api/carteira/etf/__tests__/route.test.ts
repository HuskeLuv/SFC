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
  asset: { findMany: vi.fn().mockResolvedValue([]) },
  assetPriceHistory: { findMany: vi.fn().mockResolvedValue([]) },
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

vi.mock('@/services/market/marketIndicatorService', () => ({
  getIndicator: vi.fn().mockResolvedValue({ price: 5 }),
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
  new NextRequest('http://localhost/api/carteira/etf', { method: 'GET' });

const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/etf', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('/api/carteira/etf', () => {
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
      expect(Array.isArray(data.secoes)).toBe(true);
      expect(data.totalGeral.valorAplicado).toBe(0);
    });

    it('returns sections with ETF portfolio data', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 'user-1',
          quantity: 50,
          totalInvested: 2500,
          avgPrice: 50,
          objetivo: 10,
          regiaoEtf: 'brasil',
          assetId: 'a1',
          stockId: null,
          stock: null,
          asset: { symbol: 'BOVA11', name: 'iShares Ibovespa', type: 'etf', currency: 'BRL' },
          lastUpdate: new Date(),
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.secoes.length).toBeGreaterThan(0);
      expect(data.secoes[0].ativos[0].ticker).toBe('BOVA11');
    });
  });

  describe('mover na Carteira (out/2026)', () => {
    const posicao = (over: Record<string, unknown>) => ({
      userId: 'user-1',
      quantity: 10,
      totalInvested: 1000,
      avgPrice: 100,
      objetivo: 0,
      regiaoEtf: null,
      categoriaOverride: null,
      lastUpdate: new Date(),
      ...over,
    });

    it('FII movido para ETFs aparece na região escolhida, com cotação live e selo', async () => {
      const { getAssetPrices } = await import('@/services/pricing/assetPriceService');
      vi.mocked(getAssetPrices).mockResolvedValueOnce(new Map([['XPLG11', 110]]));
      mockPrisma.portfolio.findMany.mockResolvedValue([
        posicao({
          id: 'p-xplg',
          categoriaOverride: 'etfs',
          regiaoEtf: 'estados_unidos',
          asset: { symbol: 'XPLG11', name: 'XP Log', type: 'fii', currency: 'BRL' },
        }),
      ]);
      mockPrisma.userChangeLog.findMany.mockResolvedValueOnce([
        eventoMover('p-xplg', { categoriaOverride: 'etfs', regiaoEtf: 'estados_unidos' }),
      ]);
      const data = await (await GET(createGetRequest())).json();
      const eua = data.secoes.find((s: Secao) => s.regiao === 'estados_unidos');
      expect(eua.ativos).toHaveLength(1);
      expect(eua.ativos[0]).toMatchObject({
        ticker: 'XPLG11',
        valorAtualizado: 1100,
        movido: true,
      });
    });

    it('ETF movido para Ações some de ETFs; sem override nada muda', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        posicao({
          id: 'p-bova',
          categoriaOverride: 'acoes',
          asset: { symbol: 'BOVA11', name: 'iShares Ibovespa', type: 'etf', currency: 'BRL' },
        }),
        posicao({
          id: 'p-ivvb',
          asset: { symbol: 'IVVB11', name: 'iShares S&P', type: 'etf', currency: 'BRL' },
        }),
      ]);
      const data = await (await GET(createGetRequest())).json();
      expect(linhas(data).map((l) => l.ticker)).toEqual(['IVVB11']);
      expect(linhas(data)[0]).not.toHaveProperty('movido');
      expect(mockPrisma.userChangeLog.findMany).not.toHaveBeenCalled();
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
      const res = await POST(createPostRequest({ caixaParaInvestir: 2000 }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});
