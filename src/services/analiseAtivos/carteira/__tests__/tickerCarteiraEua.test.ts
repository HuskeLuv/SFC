import { describe, expect, it, vi } from 'vitest';
import {
  chaveCarteira,
  ehAssetManualEua,
  encontrarAssetManualEmPosicao,
  encontrarAssetManualPlanejado,
  extrairTickerManual,
  normalizarTicker,
  prefixoSymbolManualEua,
  tickerDeAssetEua,
  usuarioTemAssetManual,
} from '../tickerCarteiraEua';

/**
 * Ticker EUA entre a Análise e a Carteira (fatia D): BRK-B ↔ BRK.B ↔ BRKB, Asset manual
 * 'AAPL-<ts>-<rnd>' → AAPL, ETF em USD não vira stock e a busca no banco só olha o Portfolio/
 * a linha planejada do PRÓPRIO usuário.
 */

const manual = (symbol: string, type = 'stock', currency = 'USD', source = 'manual') => ({
  id: `a-${symbol}`,
  symbol,
  name: symbol,
  type,
  currency,
  source,
  categoria: null,
  subcategoria: null,
});

describe('normalização', () => {
  it('BRK-B, BRK.B e brkb dão BRKB; B3 não muda', () => {
    expect(normalizarTicker('BRK-B')).toBe('BRKB');
    expect(normalizarTicker('BRK.B')).toBe('BRKB');
    expect(normalizarTicker(' brkb ')).toBe('BRKB');
    expect(chaveCarteira('BRK.B')).toBe(chaveCarteira('BRKB'));
    expect(chaveCarteira('PETR4')).toBe('PETR4');
    expect(chaveCarteira('KNCR11')).toBe('KNCR11');
  });

  it('extrairTickerManual: AAPL-1712345678901-abc → AAPL; sem o formato volta inteiro', () => {
    expect(extrairTickerManual('AAPL-1712345678901-abc')).toBe('AAPL');
    expect(extrairTickerManual('BRKB-1712345678901-x1y2z3')).toBe('BRKB');
    expect(extrairTickerManual('O-1712345678901-q')).toBe('O');
    expect(extrairTickerManual('WEGE3')).toBe('WEGE3');
  });

  it('prefixo do symbol manual = o da compra pelo wizard', () => {
    expect(prefixoSymbolManualEua('BRK.B')).toBe('BRKB-');
    expect(prefixoSymbolManualEua('o')).toBe('O-');
  });
});

describe('tickerDeAssetEua / ehAssetManualEua', () => {
  it('stock e REIT manuais em USD têm ticker normalizado', () => {
    expect(tickerDeAssetEua(manual('AAPL-1712345678901-abc'))).toBe('AAPL');
    expect(tickerDeAssetEua(manual('BRKB-1712345678901-abc'))).toBe('BRKB');
    expect(tickerDeAssetEua(manual('O-1712345678901-abc', 'reit'))).toBe('O');
  });

  it('ETF em USD não vira stock; ação da B3 e Asset de catálogo também não', () => {
    expect(tickerDeAssetEua(manual('VOO-1712345678901-abc', 'etf'))).toBeNull();
    expect(tickerDeAssetEua(manual('PETR4', 'stock', 'BRL', 'brapi'))).toBeNull();
    expect(tickerDeAssetEua(manual('AAPL', 'stock', 'USD', 'brapi'))).toBeNull();
    expect(ehAssetManualEua(null)).toBe(false);
  });
});

describe('encontrarAssetManualEmPosicao', () => {
  it('filtra pelo Portfolio do usuário com quantidade > 0 e Asset manual USD do ticker', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'p-1', asset: manual('BRKB-1712345678901-abc') }]);
    const r = await encontrarAssetManualEmPosicao(
      { portfolio: { findMany } } as never,
      'u1',
      ['stock', 'reit'],
      'BRK.B',
    );
    expect(r).toEqual({ asset: manual('BRKB-1712345678901-abc'), portfolioId: 'p-1' });
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      userId: 'u1',
      quantity: { gt: 0 },
      asset: {
        type: { in: ['stock', 'reit'] },
        source: 'manual',
        currency: 'USD',
        symbol: { startsWith: 'BRKB-' },
      },
    });
  });

  it('ignora Asset de outro usuário e posição zerada (o banco não devolve) → null', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    expect(
      await encontrarAssetManualEmPosicao(
        { portfolio: { findMany } } as never,
        'u2',
        'stock',
        'AAPL',
      ),
    ).toBeNull();
    expect(findMany.mock.calls[0][0].where.userId).toBe('u2');
  });

  it('prefixo parecido de outro ticker não casa (AAPLX não é AAPL)', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'p-x', asset: manual('AAPLX-1-a') }]);
    expect(
      await encontrarAssetManualEmPosicao(
        { portfolio: { findMany } } as never,
        'u1',
        'stock',
        'AAPL',
      ),
    ).toBeNull();
  });

  it('ticker vazio não consulta', async () => {
    const findMany = vi.fn();
    expect(
      await encontrarAssetManualEmPosicao({ portfolio: { findMany } } as never, 'u1', 'stock', ' '),
    ).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('encontrarAssetManualPlanejado', () => {
  it('linha planejada do usuário com o Asset manual do ticker', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'w-1', asset: manual('O-1-a', 'reit') }]);
    const r = await encontrarAssetManualPlanejado(
      { watchlist: { findMany } } as never,
      'u1',
      'reit',
      'O',
    );
    expect(r?.watchlistId).toBe('w-1');
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      userId: 'u1',
      asset: { type: { in: ['reit'] }, symbol: { startsWith: 'O-' } },
    });
  });
});

describe('usuarioTemAssetManual', () => {
  it('true com Portfolio ou linha planejada do usuário; false sem nenhum', async () => {
    const db = (p: unknown, w: unknown) => ({
      portfolio: { findFirst: vi.fn().mockResolvedValue(p) },
      watchlist: { findFirst: vi.fn().mockResolvedValue(w) },
    });
    expect(await usuarioTemAssetManual(db({ id: 'p' }, null) as never, 'u1', 'a1')).toBe(true);
    expect(await usuarioTemAssetManual(db(null, { id: 'w' }) as never, 'u1', 'a1')).toBe(true);
    const nenhum = db(null, null);
    expect(await usuarioTemAssetManual(nenhum as never, 'u1', 'a1')).toBe(false);
    expect(nenhum.portfolio.findFirst.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      assetId: 'a1',
    });
  });
});
