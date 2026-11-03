/**
 * Guarda de moeda do IR mensal BR (ETF americano, nov/2026): ativo em dólar nunca entra no
 * DARF BR, mesmo com symbol manual terminado em '11'. O ETF da B3 (BRL) continua etf_br.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { carregarApuracaoRendaVariavel, categorizeTransaction } from '../rendaVariavelLoader';

const VOO_MANUAL = 'VOO-1730000000000-ab3cd11';

describe('categorizeTransaction — guarda de moeda', () => {
  it('ETF manual em US$ terminado em 11 = null (fica fora do DARF BR)', () => {
    expect(categorizeTransaction(VOO_MANUAL, 'etf', 'USD')).toBeNull();
  });

  it('IVVB11 em BRL continua etf_br', () => {
    expect(categorizeTransaction('IVVB11', 'etf', 'BRL')).toBe('etf_br');
  });

  it('sem currency mantém a regra antiga (compatível com chamadas de 2 argumentos)', () => {
    expect(categorizeTransaction('BOVA11', 'etf')).toBe('etf_br');
    expect(categorizeTransaction('PETR4', 'stock', 'BRL')).toBe('acao_br');
    expect(categorizeTransaction('HGLG11', 'fii', 'BRL')).toBe('fii');
  });

  it('stock e REIT em US$ continuam fora', () => {
    expect(categorizeTransaction('AAPL-1730000000000-xyz1234', 'stock', 'USD')).toBeNull();
    expect(categorizeTransaction('O-1730000000000-xyz1211', 'reit', 'USD')).toBeNull();
  });
});

describe('carregarApuracaoRendaVariavel — ETF USD fora, IVVB11 dentro', () => {
  const voo = { id: 'a-voo', symbol: VOO_MANUAL, type: 'etf', currency: 'USD' };
  const ivvb = { id: 'a-ivvb', symbol: 'IVVB11', type: 'etf', currency: 'BRL' };
  const tx = (
    asset: typeof voo,
    type: 'compra' | 'venda',
    date: string,
    quantity: number,
    price: number,
  ) => ({
    id: `${asset.id}-${type}-${date}`,
    userId: 'user-1',
    assetId: asset.id,
    type,
    date: new Date(date),
    quantity,
    price,
    fees: 0,
    notes: null,
    asset,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx(voo, 'compra', '2026-03-02T12:00:00Z', 10, 500),
      tx(voo, 'venda', '2026-04-15T12:00:00Z', 10, 600),
      tx(ivvb, 'compra', '2026-03-02T12:00:00Z', 100, 300),
      tx(ivvb, 'venda', '2026-04-15T12:00:00Z', 100, 320),
    ]);
  });

  it('abril só tem o lucro do IVVB11 em etf_br', async () => {
    const { meses } = await carregarApuracaoRendaVariavel('user-1');
    const abril = meses.find((m) => m.yearMonth === '2026-04');
    expect(abril?.porCategoria.etf_br?.lucroTributavel).toBeCloseTo(2000);
    expect(abril?.porCategoria.acao_br).toBeUndefined();
    expect(abril?.porCategoria.fii).toBeUndefined();
  });
});
