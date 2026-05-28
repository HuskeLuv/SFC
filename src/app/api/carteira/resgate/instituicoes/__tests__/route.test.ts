import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  institution: { findMany: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { GET } from '../route';

const reqWithTipo = (tipo: string) =>
  new NextRequest(`http://localhost/api/carteira/resgate/instituicoes?tipo=${tipo}`);

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  mockPrisma.institution.findMany.mockResolvedValue([]);
});

describe('GET /api/carteira/resgate/instituicoes (#14 do checklist mai/28)', () => {
  const bondPortfolio = () => [
    {
      id: 'pf-1',
      assetId: 'asset-bond-1',
      asset: { type: 'bond', symbol: 'CDB1', name: 'CDB X' },
    },
  ];

  const txWithInst = (instId: string | null) => [
    {
      id: 'tx-1',
      assetId: 'asset-bond-1',
      type: 'compra',
      date: new Date(),
      notes: JSON.stringify({ operation: { instituicaoId: instId } }),
    },
  ];

  it('retorna instituição quando tipo pedido é renda-fixa-posfixada (asset.type=bond)', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue(bondPortfolio());
    mockPrisma.stockTransaction.findMany.mockResolvedValue(txWithInst('inst-btg'));
    mockPrisma.institution.findMany.mockResolvedValue([{ id: 'inst-btg', nome: 'BTG' }]);

    const res = await GET(reqWithTipo('renda-fixa-posfixada'));
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.instituicoes).toEqual(
      expect.arrayContaining([{ value: 'inst-btg', label: 'BTG' }]),
    );
  });

  it('aceita também renda-fixa-prefixada e renda-fixa-hibrida', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue(bondPortfolio());
    mockPrisma.stockTransaction.findMany.mockResolvedValue(txWithInst('inst-btg'));
    mockPrisma.institution.findMany.mockResolvedValue([{ id: 'inst-btg', nome: 'BTG' }]);

    for (const tipo of ['renda-fixa', 'renda-fixa-prefixada', 'renda-fixa-hibrida']) {
      vi.clearAllMocks();
      mockRequireAuthWithActing.mockResolvedValue({
        payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
        targetUserId: 'user-1',
        actingClient: null,
      });
      mockPrisma.portfolio.findMany.mockResolvedValue(bondPortfolio());
      mockPrisma.stockTransaction.findMany.mockResolvedValue(txWithInst('inst-btg'));
      mockPrisma.institution.findMany.mockResolvedValue([{ id: 'inst-btg', nome: 'BTG' }]);

      const res = await GET(reqWithTipo(tipo));
      const data = await res.json();
      expect(data.instituicoes.length).toBeGreaterThan(0);
    }
  });

  it('não casa bond quando tipo pedido não é da família renda-fixa', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue(bondPortfolio());
    mockPrisma.stockTransaction.findMany.mockResolvedValue(txWithInst('inst-btg'));
    mockPrisma.institution.findMany.mockResolvedValue([{ id: 'inst-btg', nome: 'BTG' }]);

    const res = await GET(reqWithTipo('acao'));
    const data = await res.json();
    expect(data.instituicoes).toEqual([]);
  });

  it('retorna 400 quando tipo está ausente', async () => {
    const res = await GET(new NextRequest('http://localhost/api/carteira/resgate/instituicoes'));
    expect(res.status).toBe(400);
  });

  it('inclui "Instituição não informada" quando há tx de bond sem instituicaoId', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue(bondPortfolio());
    mockPrisma.stockTransaction.findMany.mockResolvedValue(txWithInst(null));
    mockPrisma.institution.findMany.mockResolvedValue([]);

    const res = await GET(reqWithTipo('renda-fixa-posfixada'));
    const data = await res.json();
    expect(data.instituicoes).toEqual(
      expect.arrayContaining([{ value: 'unknown', label: 'Instituição não informada' }]),
    );
  });
});
