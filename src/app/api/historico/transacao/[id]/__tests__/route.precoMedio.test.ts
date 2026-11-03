import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/** Compra do Open Finance sem custo do banco: corrigir o preço tira o aviso. */
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

const NOTAS_MARCADAS = JSON.stringify({
  observacoes: 'Importado do banco (Open Finance)',
  operation: { action: 'compra', origem: 'open-finance', precoMedioNaoInformado: true },
});

const transacao = {
  id: 'tx-1',
  userId: 'user-1',
  assetId: 'asset-1',
  type: 'compra',
  quantity: 40,
  price: 472,
  total: 18880,
  fees: 0,
  date: new Date('2026-10-26'),
  notes: NOTAS_MARCADAS,
  asset: { id: 'asset-1', symbol: 'IVVB11', type: 'etf', currency: 'BRL' },
};

const dadosGravados = () => mockPrisma.stockTransaction.update.mock.calls[0][0].data;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.stockTransaction.update.mockResolvedValue({});
  mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });
  mockPrisma.stockTransaction.findFirst.mockResolvedValue(transacao);
});

describe('PATCH /api/historico/transacao/[id] — preço médio não informado pelo banco', () => {
  it('editar o preço tira o marcador e mantém o resto das notes', async () => {
    const res = await callPATCH({ price: 393.7 });
    expect(res.status).toBe(200);
    const data = dadosGravados();
    expect(data.price).toBe(393.7);
    expect(JSON.parse(data.notes)).toEqual({
      observacoes: 'Importado do banco (Open Finance)',
      operation: { action: 'compra', origem: 'open-finance' },
    });
    expect(mockRecalc).toHaveBeenCalled();
  });

  it('editar o total também tira o marcador', async () => {
    await callPATCH({ total: 15748 });
    expect(JSON.parse(dadosGravados().notes).operation.precoMedioNaoInformado).toBeUndefined();
  });

  it('editar só a data mantém o aviso (o preço segue o da conexão)', async () => {
    await callPATCH({ date: '2024-03-15' });
    expect(dadosGravados()).not.toHaveProperty('notes');
  });
});
