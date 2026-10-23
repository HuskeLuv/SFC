import { afterEach, describe, expect, it, vi } from 'vitest';
import { somarCustoEmBrl, valuatePortfolioItem, type ItemValuationInput } from '../itemValuation';

/**
 * Carteira EUA em US$ (FB): a valoração converte pela unidade GRAVADA (posicaoEmDolar),
 * sem depender da chave CARTEIRA_EUA_DOLAR_HABILITADO.
 */

const REIT = { symbol: 'O-1700000000000-abc', type: 'reit', currency: 'USD' };
const STOCK_USD = { symbol: 'AAPL', type: 'stock', currency: 'USD' };

const reit = (over: Partial<ItemValuationInput['item']> = {}) => ({
  assetId: 'a-reit',
  quantity: 4,
  avgPrice: 110,
  totalInvested: 440,
  moedaRegistro: null,
  totalInvestedBrl: null,
  ...over,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('valuatePortfolioItem — posição em US$', () => {
  it('PETR4 (BRL) intacto, mesmo com câmbio informado', () => {
    const v = valuatePortfolioItem({
      item: { assetId: 'p', quantity: 100, avgPrice: 30, totalInvested: 3000 },
      asset: { symbol: 'PETR4', type: 'stock', currency: 'BRL' },
      quote: 41,
      cotacaoDolar: 5.4,
    });
    expect(v.valorAtualBRL).toBeCloseTo(4100);
    expect(v.valorAplicadoBRL).toBe(3000);
    expect(v.categoria).toBe('acoes');
    expect(v.semCambio).toBeUndefined();
  });

  it('REIT sem cotação = q × avgPrice × fx; aplicado = totalInvested × fx', () => {
    const v = valuatePortfolioItem({ item: reit(), asset: REIT, quote: null, cotacaoDolar: 5.4 });
    expect(v.valorAtualBRL).toBeCloseTo(4 * 110 * 5.4);
    expect(v.valorAplicadoBRL).toBeCloseTo(440 * 5.4);
    expect(v.fonte).toBe('fallback');
    expect(v.categoria).toBe('reits');
    expect(v.contaNoSaldoBruto).toBe(true);
  });

  it('REIT com cotação US$: q × quote × fx, sem dupla conversão', () => {
    const v = valuatePortfolioItem({ item: reit(), asset: REIT, quote: 120, cotacaoDolar: 5.4 });
    expect(v.valorAtualBRL).toBeCloseTo(4 * 120 * 5.4);
    expect(v.fonte).toBe('quote');
  });

  it('aplicado usa totalInvestedBrl quando preenchido', () => {
    const v = valuatePortfolioItem({
      item: reit({ totalInvestedBrl: 2300 }),
      asset: REIT,
      quote: null,
      cotacaoDolar: 5.4,
    });
    expect(v.valorAplicadoBRL).toBe(2300);
  });

  it("stock com moedaRegistro 'USD' converte como o REIT", () => {
    const v = valuatePortfolioItem({
      item: { assetId: 's', quantity: 2, avgPrice: 200, totalInvested: 400, moedaRegistro: 'USD' },
      asset: STOCK_USD,
      quote: null,
      cotacaoDolar: 5,
    });
    expect(v.valorAtualBRL).toBeCloseTo(2000);
    expect(v.valorAplicadoBRL).toBeCloseTo(2000);
    expect(v.categoria).toBe('stocks');
  });

  it('stock com moedaRegistro null (legado R$): idêntico a hoje', () => {
    const legado = { assetId: 's', quantity: 2, avgPrice: 1080, totalInvested: 2160 };
    const semCotacao = valuatePortfolioItem({
      item: { ...legado, moedaRegistro: null },
      asset: STOCK_USD,
      quote: null,
      cotacaoDolar: 5.4,
    });
    expect(semCotacao).toEqual({
      categoria: 'stocks',
      valorAplicadoBRL: 2160,
      contaNoSaldoBruto: true,
      valorAtualBRL: 2160,
      fonte: 'fallback',
    });
    const comCotacao = valuatePortfolioItem({
      item: { ...legado, moedaRegistro: null },
      asset: STOCK_USD,
      quote: 210,
      cotacaoDolar: 5.4,
    });
    expect(comCotacao).toEqual({
      categoria: 'stocks',
      valorAplicadoBRL: 2160,
      contaNoSaldoBruto: true,
      valorAtualBRL: 2 * 210 * 5.4,
      fonte: 'quote',
    });
  });

  it('crypto em USD intacto (preço já em R$)', () => {
    const v = valuatePortfolioItem({
      item: { assetId: 'c', quantity: 0.5, avgPrice: 300000, totalInvested: 150000 },
      asset: { symbol: 'BTC', type: 'crypto', currency: 'USD' },
      quote: 600000,
      cotacaoDolar: 5.4,
    });
    expect(v.valorAtualBRL).toBeCloseTo(300000);
    expect(v.valorAplicadoBRL).toBe(150000);
  });

  it("sem câmbio: 'semCambio', valores zerados e fora do saldo", () => {
    for (const cotacaoDolar of [null, undefined, 0]) {
      const v = valuatePortfolioItem({ item: reit(), asset: REIT, quote: 120, cotacaoDolar });
      expect(v).toMatchObject({
        semCambio: true,
        fonte: 'semCambio',
        valorAtualBRL: 0,
        valorAplicadoBRL: 0,
        contaNoSaldoBruto: false,
        categoria: 'reits',
      });
    }
  });

  it('resultado igual com a chave ligada e desligada', () => {
    const input: ItemValuationInput = {
      item: reit({ totalInvestedBrl: 2300 }),
      asset: REIT,
      quote: 115,
      cotacaoDolar: 5.4,
    };
    vi.stubEnv('CARTEIRA_EUA_DOLAR_HABILITADO', 'false');
    const desligada = valuatePortfolioItem(input);
    vi.stubEnv('CARTEIRA_EUA_DOLAR_HABILITADO', 'true');
    const ligada = valuatePortfolioItem(input);
    expect(ligada).toEqual(desligada);
  });
});

describe('somarCustoEmBrl', () => {
  const PETR4 = { type: 'stock', currency: 'BRL' };
  it('soma o custo em R$: posição em US$ convertida, BRL como gravado', () => {
    expect(
      somarCustoEmBrl(
        [
          { totalInvested: 3000, asset: PETR4 },
          { totalInvested: 440, moedaRegistro: null, asset: REIT },
          { totalInvested: 400, moedaRegistro: 'USD', totalInvestedBrl: 2100, asset: STOCK_USD },
          { totalInvested: 2160, moedaRegistro: null, asset: STOCK_USD },
        ],
        5.4,
      ),
    ).toBeCloseTo(3000 + 2376 + 2100 + 2160);
  });

  it('sem câmbio: posição em US$ sem totalInvestedBrl fica fora', () => {
    expect(
      somarCustoEmBrl(
        [
          { totalInvested: 3000, asset: PETR4 },
          { totalInvested: 440, asset: REIT },
        ],
        null,
      ),
    ).toBe(3000);
  });
});
