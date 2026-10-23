import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Carteira EUA em US$ (fatia FA): o PATCH do histórico mescla as notes novas sobre as antigas e
 * preserva operation.{unidade, moeda, cotacaoMoeda} de ativo em dólar.
 */
const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findFirst: vi.fn(), update: vi.fn() },
  portfolio: { findFirst: vi.fn() },
  userChangeLog: { create: vi.fn().mockResolvedValue({}) },
}));
const mockRecalc = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/portfolio/portfolioRecalculation', () => ({
  recalculatePortfolioFromTransactions: mockRecalc,
  invalidatePortfolioSnapshots: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/planejamento/carteiraToSonhoRealizado', () => ({
  syncSonhoRealizadoBestEffort: vi.fn().mockResolvedValue(undefined),
}));

import { PATCH } from '../route';

const callPATCH = (body: object) =>
  PATCH(
    new NextRequest('http://localhost/api/historico/transacao/tx-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    { params: Promise.resolve({ id: 'tx-1' }) },
  );

const notasAntigas = JSON.stringify({
  estrategia: 'growth',
  cotacaoMoeda: 5,
  operation: {
    action: 'compra',
    instituicaoId: 'inst-1',
    moeda: 'USD',
    unidade: 'USD',
    cotacaoMoeda: 5,
    price: 100,
  },
});

const transacao = (asset: Record<string, unknown>, notes: string | null = notasAntigas) => ({
  id: 'tx-1',
  userId: 'user-1',
  assetId: 'asset-1',
  type: 'compra',
  quantity: 10,
  price: 100,
  total: 1000,
  fees: 0,
  date: new Date('2026-01-10'),
  notes,
  asset,
});

const stockUsd = { id: 'asset-1', symbol: 'AAPL-1-x', type: 'stock', currency: 'USD' };

const notasGravadas = () => mockPrisma.stockTransaction.update.mock.calls[0][0].data.notes;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.stockTransaction.update.mockResolvedValue({});
  mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });
});

describe('PATCH /api/historico/transacao/[id] — marcador de unidade', () => {
  it('notes novas preservam o marcador (mesmo tentando trocá-lo) e mesclam o resto', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(transacao(stockUsd));
    const res = await callPATCH({
      notes: JSON.stringify({
        observacoes: 'corrigido',
        operation: { unidade: 'BRL', moeda: 'BRL', cotacaoMoeda: 9, price: 110 },
      }),
    });
    expect(res.status).toBe(200);

    const notes = JSON.parse(notasGravadas());
    expect(notes.observacoes).toBe('corrigido');
    expect(notes.estrategia).toBe('growth');
    expect(notes.operation).toMatchObject({
      action: 'compra',
      instituicaoId: 'inst-1',
      unidade: 'USD',
      moeda: 'USD',
      cotacaoMoeda: 5,
      price: 110,
    });
    expect(mockRecalc).toHaveBeenCalled();
  });

  it('texto solto num ativo em dólar vai para observacoes sem perder o marcador', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(transacao(stockUsd));
    await callPATCH({ notes: 'compra pela Avenue' });

    const notes = JSON.parse(notasGravadas());
    expect(notes.observacoes).toBe('compra pela Avenue');
    expect(notes.operation.unidade).toBe('USD');
  });

  it('editar só o preço mantém as notes e o marcador intactos', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(transacao(stockUsd));
    await callPATCH({ price: 120 });

    const data = mockPrisma.stockTransaction.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('notes');
    expect(data.price).toBe(120);
    expect(data.total).toBe(1200); // na unidade da transação (US$)
  });

  it('ação BR: notes JSON também mesclam, texto solto troca o campo como antes', async () => {
    const petr4 = { id: 'asset-1', symbol: 'PETR4', type: 'stock', currency: 'BRL' };
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(transacao(petr4));
    await callPATCH({ notes: 'texto livre' });
    expect(notasGravadas()).toBe('texto livre');

    vi.clearAllMocks();
    mockPrisma.stockTransaction.update.mockResolvedValue({});
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(transacao(petr4));
    await callPATCH({ notes: JSON.stringify({ operation: { unidade: 'BRL' } }) });
    const notes = JSON.parse(notasGravadas());
    // Não é ativo em dólar: não há marcador a preservar, o JSON novo vence.
    expect(notes.operation.unidade).toBe('BRL');
    expect(notes.operation.instituicaoId).toBe('inst-1');
  });

  it('notes antigas vazias: grava as novas como vieram', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(transacao(stockUsd, null));
    await callPATCH({ notes: 'nova' });
    expect(notasGravadas()).toBe('nova');
  });
});
