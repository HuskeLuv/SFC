import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn() },
  portfolio: { findMany: vi.fn() },
}));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { GET } from '../route';

const marcada = JSON.stringify({
  observacoes: 'Importado do banco (Open Finance)',
  operation: { action: 'compra', origem: 'open-finance', precoMedioNaoInformado: true },
});

const chamar = () => GET(new NextRequest('http://localhost/api/carteira/preco-medio-pendente'));

beforeEach(() => vi.clearAllMocks());

describe('GET /api/carteira/preco-medio-pendente', () => {
  it('lista as posições abertas com compra marcada, por ticker', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      { assetId: 'a-ivvb', notes: marcada },
      { assetId: 'a-ivvb', notes: marcada },
      { assetId: 'a-bbas', notes: marcada },
      // contém o trecho mas não é o marcador de verdade (texto livre): ignorado
      { assetId: 'a-x', notes: 'nota "precoMedioNaoInformado":true' },
    ]);
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { id: 'p-ivvb', asset: { symbol: 'IVVB11', name: 'iShares S&P 500', type: 'etf' } },
      { id: 'p-bbas', asset: { symbol: 'BBAS3', name: 'Banco do Brasil', type: 'stock' } },
    ]);

    const res = await chamar();
    const body = await res.json();
    expect(mockPrisma.portfolio.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', assetId: { in: ['a-ivvb', 'a-bbas'] }, quantity: { gt: 0 } },
      }),
    );
    expect(body.posicoes.map((p: { ticker: string }) => p.ticker)).toEqual(['BBAS3', 'IVVB11']);
    expect(body.posicoes[0]).toEqual({
      portfolioId: 'p-bbas',
      ticker: 'BBAS3',
      nome: 'Banco do Brasil',
      tipo: 'stock',
    });
  });

  it('sem compra marcada: lista vazia, sem consultar posições', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    const body = await (await chamar()).json();
    expect(body).toEqual({ posicoes: [] });
    expect(mockPrisma.portfolio.findMany).not.toHaveBeenCalled();
  });
});
