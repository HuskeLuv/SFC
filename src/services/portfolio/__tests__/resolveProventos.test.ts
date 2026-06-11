import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn() },
  portfolioProvento: { findMany: vi.fn() },
  assetCorporateAction: { findMany: vi.fn() },
}));

const mockGetDividends = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

// Mantém isJcpType/getJcpIrrfRate reais; mocka só o fetch de dividendos.
vi.mock('@/services/pricing/dividendService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/pricing/dividendService')>();
  return { ...actual, getDividends: mockGetDividends };
});

import { resolveProventoEvents } from '../resolveProventos';

const d = (iso: string) => new Date(iso);

describe('resolveProventoEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockPrisma.portfolioProvento.findMany.mockResolvedValue([]);
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([]);
    mockGetDividends.mockResolvedValue([]);
  });

  it('retorna vazio sem transações', async () => {
    const res = await resolveProventoEvents('u1');
    expect(res).toEqual({ events: [], total: 0 });
    expect(mockGetDividends).not.toHaveBeenCalled();
  });

  it('calcula provento = quantidade detida na data-ex × valor unitário', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        date: d('2024-01-10'),
        type: 'compra',
        quantity: 100,
        notes: null,
        asset: { symbol: 'ITSA4' },
      },
    ]);
    mockGetDividends.mockResolvedValue([
      { date: d('2024-03-01'), dataCom: d('2024-02-15'), tipo: 'Dividendo', valorUnitario: 0.5 },
    ]);

    const res = await resolveProventoEvents('u1');
    expect(res.events).toHaveLength(1);
    expect(res.events[0]).toMatchObject({ symbol: 'ITSA4', tipo: 'Dividendo', net: 50 });
    expect(res.total).toBeCloseTo(50, 6);
  });

  it('ancora na DATA-EX (data-com + 1) pro Total Return, preservando paymentDay', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        date: d('2024-01-10'),
        type: 'compra',
        quantity: 100,
        notes: null,
        asset: { symbol: 'HFOF11' },
      },
    ]);
    mockGetDividends.mockResolvedValue([
      { date: d('2024-03-15'), dataCom: d('2024-02-29'), tipo: 'Rendimento', valorUnitario: 0.6 },
    ]);
    const res = await resolveProventoEvents('u1');
    // data-com 29/02 → data-ex (preço cai) = 01/03; pagamento permanece 15/03.
    expect(res.events[0].exDay).toBe(Date.UTC(2024, 2, 1));
    expect(res.events[0].paymentDay).toBe(Date.UTC(2024, 2, 15));
  });

  it('exDay cai no pagamento quando a data-com é desconhecida', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        date: d('2024-01-10'),
        type: 'compra',
        quantity: 100,
        notes: null,
        asset: { symbol: 'XPML11' },
      },
    ]);
    mockGetDividends.mockResolvedValue([
      { date: d('2024-03-15'), dataCom: null, tipo: 'Rendimento', valorUnitario: 0.6 },
    ]);
    const res = await resolveProventoEvents('u1');
    expect(res.events[0].exDay).toBe(res.events[0].paymentDay);
    expect(res.events[0].exDay).toBe(Date.UTC(2024, 2, 15));
  });

  it('ignora dividendo anterior à primeira compra (não detinha o ativo)', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        date: d('2024-06-01'),
        type: 'compra',
        quantity: 100,
        notes: null,
        asset: { symbol: 'ITSA4' },
      },
    ]);
    mockGetDividends.mockResolvedValue([
      { date: d('2024-01-01'), dataCom: d('2023-12-15'), tipo: 'Dividendo', valorUnitario: 0.5 },
    ]);

    const res = await resolveProventoEvents('u1');
    expect(res.events).toHaveLength(0);
    expect(res.total).toBe(0);
  });

  it('aplica IRRF sobre JCP (15% antes de 2026)', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        date: d('2024-01-10'),
        type: 'compra',
        quantity: 100,
        notes: null,
        asset: { symbol: 'ITSA4' },
      },
    ]);
    mockGetDividends.mockResolvedValue([
      { date: d('2024-05-01'), dataCom: d('2024-04-15'), tipo: 'JCP', valorUnitario: 1 },
    ]);

    const res = await resolveProventoEvents('u1');
    // 100 × 1 = 100 bruto; IRRF 15% = 15 → líquido 85.
    expect(res.events[0].net).toBeCloseTo(85, 6);
  });

  it('dismissed suprime o evento-base', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        date: d('2024-01-10'),
        type: 'compra',
        quantity: 100,
        notes: null,
        asset: { symbol: 'ITSA4' },
      },
    ]);
    mockGetDividends.mockResolvedValue([
      { date: d('2024-03-01'), dataCom: d('2024-02-15'), tipo: 'Dividendo', valorUnitario: 0.5 },
    ]);
    mockPrisma.portfolioProvento.findMany.mockResolvedValue([
      {
        dataPagamento: d('2024-03-01'),
        tipo: 'Dividendo',
        valorTotal: 50,
        impostoRenda: null,
        source: 'brapi',
        dismissed: true,
        portfolio: { asset: { symbol: 'ITSA4' } },
      },
    ]);

    const res = await resolveProventoEvents('u1');
    expect(res.events).toHaveLength(0);
    expect(res.total).toBe(0);
  });

  it('override manual vence o valor do histórico', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        date: d('2024-01-10'),
        type: 'compra',
        quantity: 100,
        notes: null,
        asset: { symbol: 'ITSA4' },
      },
    ]);
    mockGetDividends.mockResolvedValue([
      { date: d('2024-03-01'), dataCom: d('2024-02-15'), tipo: 'Dividendo', valorUnitario: 0.5 },
    ]);
    mockPrisma.portfolioProvento.findMany.mockResolvedValue([
      {
        dataPagamento: d('2024-03-01'),
        tipo: 'Dividendo',
        valorTotal: 77,
        impostoRenda: null,
        source: 'manual',
        dismissed: false,
        portfolio: { asset: { symbol: 'ITSA4' } },
      },
    ]);

    const res = await resolveProventoEvents('u1');
    expect(res.events).toHaveLength(1);
    expect(res.events[0].net).toBe(77);
  });

  it('inclui provento manual sem correspondência no histórico', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        date: d('2024-01-10'),
        type: 'compra',
        quantity: 100,
        notes: null,
        asset: { symbol: 'ITSA4' },
      },
    ]);
    mockGetDividends.mockResolvedValue([]);
    mockPrisma.portfolioProvento.findMany.mockResolvedValue([
      {
        dataPagamento: d('2024-04-01'),
        tipo: 'Rendimento',
        valorTotal: 12.34,
        impostoRenda: null,
        source: 'manual',
        dismissed: false,
        portfolio: { asset: { symbol: 'ITSA4' } },
      },
    ]);

    const res = await resolveProventoEvents('u1');
    expect(res.events).toHaveLength(1);
    expect(res.events[0]).toMatchObject({ symbol: 'ITSA4', tipo: 'Rendimento', net: 12.34 });
  });
});
