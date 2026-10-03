import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);
const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn(), count: vi.fn() },
  portfolio: { findMany: vi.fn() },
}));
const mockReservaDestinoPorAsset = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ default: mockPrisma, prisma: mockPrisma }));
vi.mock('@/services/portfolio/tesouroDestino', () => ({
  reservaDestinoPorAsset: mockReservaDestinoPorAsset,
}));

import { GET } from '../route';

const tx = (overrides: Record<string, unknown> = {}) => ({
  id: 'tx-1',
  date: new Date(Date.UTC(2026, 7, 10)),
  type: 'compra',
  quantity: 10,
  price: 50,
  total: 500,
  fees: 2,
  notes: null,
  assetId: 'a-petr4',
  asset: { symbol: 'PETR4', name: 'Petrobras', type: 'stock', currency: 'BRL' },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  mockPrisma.stockTransaction.count.mockResolvedValue(0);
  mockPrisma.portfolio.findMany.mockResolvedValue([]);
  mockReservaDestinoPorAsset.mockResolvedValue(new Map());
});

describe('GET /api/relatorios/movimentacoes', () => {
  it('lista movimentações com total+taxas e flag de reinvestimento', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx(),
      tx({
        id: 'tx-2',
        type: 'venda',
        notes: JSON.stringify({ operation: { action: 'reinvestimento' } }),
      }),
    ]);
    mockPrisma.stockTransaction.count.mockResolvedValue(2);

    const res = await GET(
      new NextRequest(
        'http://localhost/api/relatorios/movimentacoes?start=2026-08-01&end=2026-08-31',
      ),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalNoPeriodo).toBe(2);
    expect(body.movimentacoes[0]).toMatchObject({
      data: '2026-08-10',
      operacao: 'compra',
      ativo: 'Petrobras',
      tipoAtivo: 'stock',
      total: 502,
      jaInvestido: false,
    });
    expect(body.movimentacoes[1].jaInvestido).toBe(true);

    // Janela inclusiva: end vira lt de end+1 dia.
    const where = mockPrisma.stockTransaction.findMany.mock.calls[0][0].where;
    expect(where.date.gte.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(where.date.lt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('sem período: lista tudo (sem filtro de data)', async () => {
    await GET(new NextRequest('http://localhost/api/relatorios/movimentacoes'));
    const where = mockPrisma.stockTransaction.findMany.mock.calls[0][0].where;
    expect(where.date).toBeUndefined();
  });

  it('data inválida é ignorada (não explode)', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/relatorios/movimentacoes?start=banana'),
    );
    expect(res.status).toBe(200);
  });

  it('categoria efetiva: segue o mover, a reserva do Tesouro e Imóveis & Bens', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx(),
      tx({
        id: 'tx-fii',
        assetId: 'a-kdif',
        asset: { symbol: 'KDIF11', name: 'Kinea Infra', type: 'fii', currency: 'BRL' },
      }),
      tx({
        id: 'tx-td',
        assetId: 'a-td',
        asset: { symbol: 'TESOURO-SELIC-2029', name: 'Selic 2029', type: 'tesouro-direto' },
      }),
      tx({
        id: 'tx-casa',
        assetId: 'a-casa',
        asset: { symbol: 'IMOVEL-1', name: 'Casa', type: 'imovel' },
      }),
      tx({ id: 'tx-sem', assetId: null, asset: null }),
    ]);
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { assetId: 'a-kdif', categoriaOverride: 'fimFia' },
      { assetId: 'a-petr4', categoriaOverride: null },
    ]);
    mockReservaDestinoPorAsset.mockResolvedValue(new Map([['a-td', 'emergencia']]));

    const res = await GET(new NextRequest('http://localhost/api/relatorios/movimentacoes'));
    const body = await res.json();
    const porId = Object.fromEntries(
      body.movimentacoes.map((m: { id: string; categoria: string | null }) => [m.id, m.categoria]),
    );

    expect(porId).toEqual({
      'tx-1': 'acoes',
      'tx-fii': 'fimFia', // movido para Fundos
      'tx-td': 'reservaEmergencia', // Tesouro comprado para a reserva
      'tx-casa': 'imoveisBens',
      'tx-sem': null,
    });
    // tipo cru segue no payload (compatibilidade)
    expect(body.movimentacoes[1].tipoAtivo).toBe('fii');
    // overrides só dos ativos da página; reserva só dos Tesouros
    expect(mockPrisma.portfolio.findMany.mock.calls[0][0].where).toEqual({
      userId: 'user-1',
      assetId: { in: ['a-petr4', 'a-kdif', 'a-td', 'a-casa'] },
    });
    expect(mockReservaDestinoPorAsset).toHaveBeenCalledWith('user-1', ['a-td']);
  });

  it('sem transações não consulta posições nem reservas', async () => {
    await GET(new NextRequest('http://localhost/api/relatorios/movimentacoes'));
    expect(mockPrisma.portfolio.findMany).not.toHaveBeenCalled();
    expect(mockReservaDestinoPorAsset).not.toHaveBeenCalled();
  });
});
