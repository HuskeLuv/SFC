import { describe, it, expect } from 'vitest';
import { getCategoriaFromPortfolio } from '@/lib/portfolioCategoria';

const vazio = new Set<string>();

describe('getCategoriaFromPortfolio — override do mover', () => {
  it('sem override mantém a heurística de sempre', () => {
    expect(
      getCategoriaFromPortfolio(
        { asset: { symbol: 'HGLG11', type: 'fii', currency: 'BRL' } },
        vazio,
      ),
    ).toBe('fiis');
    expect(
      getCategoriaFromPortfolio(
        { asset: { symbol: 'PETR4', type: 'stock', currency: 'BRL' }, categoriaOverride: null },
        vazio,
      ),
    ).toBe('acoes');
  });

  it('FII movido para Fundos agrupa em fimFia', () => {
    expect(
      getCategoriaFromPortfolio(
        { asset: { symbol: 'HGLG11', type: 'fii', currency: 'BRL' }, categoriaOverride: 'fimFia' },
        vazio,
      ),
    ).toBe('fimFia');
  });

  it('ETF movido para Ações agrupa em acoes', () => {
    expect(
      getCategoriaFromPortfolio(
        { asset: { symbol: 'BOVA11', type: 'etf', currency: 'BRL' }, categoriaOverride: 'acoes' },
        vazio,
      ),
    ).toBe('acoes');
  });

  it('override igual à base ou inválido não muda nada', () => {
    expect(
      getCategoriaFromPortfolio(
        { asset: { symbol: 'HGLG11', type: 'fii', currency: 'BRL' }, categoriaOverride: 'fiis' },
        vazio,
      ),
    ).toBe('fiis');
    expect(
      getCategoriaFromPortfolio(
        { asset: { symbol: 'HGLG11', type: 'fii', currency: 'BRL' }, categoriaOverride: 'xpto' },
        vazio,
      ),
    ).toBe('fiis');
  });

  it('item fora das abas movíveis ignora o override', () => {
    expect(
      getCategoriaFromPortfolio(
        { asset: { symbol: 'BTC', type: 'crypto', currency: 'BRL' }, categoriaOverride: 'acoes' },
        vazio,
      ),
    ).toBe('moedasCriptos');
    expect(
      getCategoriaFromPortfolio(
        {
          asset: { symbol: 'RESERVA-EMERG-1', type: 'emergency' },
          categoriaOverride: 'acoes',
        },
        vazio,
      ),
    ).toBe('reservaEmergencia');
  });
});
