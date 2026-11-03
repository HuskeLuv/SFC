import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  portfolio: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
}));

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import { GET } from '../route';
import { sugerirTipoPlanoPrevidencia } from '@/services/ir/irpfAnual';

const req = (qs = '') => new NextRequest(`http://localhost/api/analises/ir-pgbl${qs}`);

const assetPgbl = {
  id: 'a1',
  name: 'Renda Futura 2045 PGBL',
  cnpj: '11.111.111/0001-11',
  currentPrice: { toNumber: () => 2 },
};
const assetNeutro = { id: 'a2', name: 'XP Prev Multimercado FIE', cnpj: null, currentPrice: null };

describe('GET /api/analises/ir-pgbl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'u1' },
      targetUserId: 'u1',
      actingClient: null,
    });
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  });

  it('sem previdência devolve lista vazia', async () => {
    const res = await GET(req('?year=2026'));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.year).toBe(2026);
    expect(data.planos).toEqual([]);
  });

  it('agrupa aportes e resgates do ano por plano, com saldo atual', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { asset: assetPgbl, quantity: 1000, avgPrice: 1.5, totalInvested: 1500 },
      { asset: assetNeutro, quantity: 0, avgPrice: 0, totalInvested: 800 },
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      { asset: assetPgbl, type: 'compra', total: 1000, quantity: 500, price: 2 },
      { asset: assetPgbl, type: 'compra', total: 200, quantity: 100, price: 2 },
      { asset: assetPgbl, type: 'venda', total: 50, quantity: 25, price: 2 },
      { asset: assetNeutro, type: 'compra', total: 0, quantity: 10, price: 30 },
    ]);
    const data = await (await GET(req('?year=2026'))).json();
    expect(data.planos).toEqual([
      {
        assetId: 'a1',
        nome: 'Renda Futura 2045 PGBL',
        cnpj: '11.111.111/0001-11',
        tipoSugerido: 'pgbl',
        aportesQuantidade: 2,
        aportesTotal: 1200,
        resgatesTotal: 50,
        saldoAtual: 2000,
      },
      {
        assetId: 'a2',
        nome: 'XP Prev Multimercado FIE',
        cnpj: null,
        tipoSugerido: null,
        aportesQuantidade: 1,
        aportesTotal: 300,
        resgatesTotal: 0,
        saldoAtual: 800,
      },
    ]);
  });

  it('filtra as transações pelo ano pedido e pelo alvo do consultor', async () => {
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'consultor' },
      targetUserId: 'cliente',
      actingClient: { id: 'cliente' },
    });
    await GET(req('?year=2025'));
    const where = mockPrisma.stockTransaction.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('cliente');
    expect(where.asset).toEqual({ type: 'previdencia' });
    expect(where.date.gte.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(where.date.lt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('sugerirTipoPlanoPrevidencia', () => {
  it('palpite só quando o nome é inequívoco', () => {
    expect(sugerirTipoPlanoPrevidencia('Brasilprev PGBL RT')).toBe('pgbl');
    expect(sugerirTipoPlanoPrevidencia('Icatu VGBL Moderado')).toBe('vgbl');
    expect(sugerirTipoPlanoPrevidencia('Fundo PGBL/VGBL')).toBeNull();
    expect(sugerirTipoPlanoPrevidencia('XP Prev FIE')).toBeNull();
  });
});
