/**
 * Regressão (decisão 3 do mover na Carteira, 01/10/2026): mover NÃO muda o IR.
 * A apuração segue Asset.type + ticker das StockTransaction; o override de aba
 * vive em Portfolio.categoriaOverride e nunca é lido aqui. Um FII movido para
 * Ações continua FII: 20% e sem a isenção de R$ 20 mil das ações.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn() },
  portfolio: { findMany: vi.fn(), findFirst: vi.fn() },
  watchlist: { findMany: vi.fn(), findFirst: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { carregarApuracaoRendaVariavel, categorizeTransaction } from '../rendaVariavelLoader';

const hglg = {
  id: 'a-hglg',
  symbol: 'HGLG11',
  name: 'CSHG Logística',
  type: 'fii',
  currency: 'BRL',
};

const tx = (type: 'compra' | 'venda', date: string, quantity: number, price: number) => ({
  id: `${type}-${date}`,
  userId: 'user-1',
  assetId: hglg.id,
  type,
  date: new Date(date),
  quantity,
  price,
  fees: 0,
  asset: hglg,
});

describe('IR × mover na Carteira — FII movido para Ações', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A posição foi movida para a aba Ações — o IR não pode enxergar isso.
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { id: 'p-hglg', assetId: hglg.id, categoriaOverride: 'acoes', asset: hglg },
    ]);
    mockPrisma.portfolio.findFirst.mockResolvedValue({ categoriaOverride: 'acoes' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx('compra', '2026-03-02T12:00:00Z', 100, 100),
      // Venda pequena (R$ 12 mil < R$ 20 mil): ação seria isenta; FII não.
      tx('venda', '2026-04-15T12:00:00Z', 100, 120),
    ]);
  });

  it('categoria de IR continua fii (segue Asset.type)', () => {
    expect(categorizeTransaction('HGLG11', 'fii')).toBe('fii');
  });

  it('apuração: 20% sobre o lucro, sem isenção, e o override nunca é lido', async () => {
    const { meses } = await carregarApuracaoRendaVariavel('user-1');
    const abril = meses.find((m) => m.yearMonth === '2026-04');
    const fii = abril?.porCategoria.fii;

    expect(abril?.porCategoria.acao_br).toBeUndefined();
    expect(fii).toMatchObject({ isento: false, aliquota: 0.2, lucroTributavel: 2000 });
    expect(fii?.irDevido).toBeCloseTo(400);

    expect(mockPrisma.portfolio.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.portfolio.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.watchlist.findMany).not.toHaveBeenCalled();
  });
});
