import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import { separarPorClasse } from '../Comparador';
import { lerEstadoComparador, queryComparador } from '../useEstadoComparadorUrl';

describe('Comparador — Stocks e REITs', () => {
  it('URL aceita ticker EUA (BRK-B → BRK.B) e a aba stock/reit', () => {
    const e = lerEstadoComparador(new URLSearchParams('t=aapl,brk-b,WEGE3,x1&c=reit'));
    expect(e.tickers).toEqual(['AAPL', 'BRK.B', 'WEGE3']);
    expect(e.classe).toBe('reit');
    expect(queryComparador({ tickers: [], classe: 'stock' })).toBe('c=stock');
    expect(queryComparador({ tickers: [], classe: 'acao' })).toBe('');
  });

  it('mistura bloqueada: separa os tickers pela classe do índice', () => {
    const itens = [
      { t: 'AAPL', c: 'stock' as const },
      { t: 'MSFT', c: 'stock' as const },
      { t: 'O', c: 'reit' as const },
    ];
    expect(separarPorClasse(['AAPL', 'O', 'MSFT', 'ZZZ'], itens)).toEqual({
      stock: ['AAPL', 'MSFT'],
      reit: ['O'],
    });
  });
});
