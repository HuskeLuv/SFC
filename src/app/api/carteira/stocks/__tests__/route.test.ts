import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  // Histórico de alterações (recordChange importa prisma como default export).
  userChangeLog: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
  user: { findUnique: vi.fn() },
  portfolio: { findMany: vi.fn() },
  // Ativos planejados (sem posição): nenhum nos cenários destes testes.
  watchlist: { findMany: vi.fn().mockResolvedValue([]) },
  stockTransaction: { findMany: vi.fn() },
  dashboardData: {
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    create: vi.fn(),
  },
  // Caixa para Investir grava dentro de transação (serviço caixaParaInvestir).
  $transaction: vi.fn(),
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
  new NextRequest('http://localhost/api/carteira/stocks', { method: 'GET' });

const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/stocks', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('/api/carteira/stocks', () => {
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
      expect(data.totalGeral.valorAplicado).toBe(0);
    });

    it('returns sections with stock portfolio data', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 'user-1',
          quantity: 5,
          totalInvested: 1500,
          avgPrice: 300,
          objetivo: 25,
          estrategia: 'growth',
          assetId: 'a1',
          stockId: null,
          stock: null,
          asset: { symbol: 'AAPL', name: 'Apple Inc', type: 'stock', currency: 'USD' },
          lastUpdate: new Date(),
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.secoes.length).toBeGreaterThan(0);
      const allAtivos = data.secoes.flatMap((s: { ativos: { ticker: string }[] }) => s.ativos);
      expect(allAtivos.some((a: { ticker: string }) => a.ticker === 'AAPL')).toBe(true);
    });
  });

  describe('mover na Carteira (out/2026)', () => {
    const posicao = (over: Record<string, unknown>) => ({
      userId: 'user-1',
      quantity: 4,
      totalInvested: 400,
      avgPrice: 100,
      objetivo: 0,
      estrategia: null,
      categoriaOverride: null,
      lastUpdate: new Date(),
      ...over,
    });

    it('REIT movido para Stocks aparece na seção da estratégia, com cotação live e selo', async () => {
      const { getAssetPrices } = await import('@/services/pricing/assetPriceService');
      vi.mocked(getAssetPrices).mockResolvedValueOnce(new Map([['O', 55]]));
      mockPrisma.portfolio.findMany.mockResolvedValue([
        posicao({
          id: 'p-o',
          assetId: 'a-o',
          categoriaOverride: 'stocks',
          estrategia: 'risk',
          asset: { symbol: 'O', name: 'Realty Income', type: 'reit', currency: 'USD' },
        }),
      ]);
      mockPrisma.userChangeLog.findMany.mockResolvedValueOnce([
        eventoMover('p-o', { categoriaOverride: 'stocks', estrategia: 'risk' }),
      ]);
      const data = await (await GET(createGetRequest())).json();
      const risk = data.secoes.find((s: Secao) => s.estrategia === 'risk');
      expect(risk.ativos).toHaveLength(1);
      expect(risk.ativos[0]).toMatchObject({
        ticker: 'O',
        cotacaoAtual: 55,
        valorAtualizado: 220,
        movido: true,
      });
      expect(risk.ativos[0]).not.toHaveProperty('movidoViaConsultor');
    });

    it('stock movida para REITs some de Stocks; sem override nada muda', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        posicao({
          id: 'p-aapl',
          categoriaOverride: 'reits',
          asset: { symbol: 'AAPL', name: 'Apple', type: 'stock', currency: 'USD' },
        }),
        posicao({
          id: 'p-msft',
          estrategia: 'growth',
          asset: { symbol: 'MSFT', name: 'Microsoft', type: 'stock', currency: 'USD' },
        }),
      ]);
      const data = await (await GET(createGetRequest())).json();
      expect(linhas(data).map((l) => l.ticker)).toEqual(['MSFT']);
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
      const res = await POST(createPostRequest({ caixaParaInvestir: 3000 }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});
