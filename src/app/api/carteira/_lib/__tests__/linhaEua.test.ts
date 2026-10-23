import { describe, expect, it } from 'vitest';
import { proventoDaLinhaEmUsd, totaisEua, valoresLinhaEua } from '../linhaEua';

const REIT = { type: 'reit', currency: 'USD' };
const STOCK_USD = { type: 'stock', currency: 'USD' };

describe('valoresLinhaEua', () => {
  it('REIT (US$): valores em US$, custo em R$ pelo câmbio quando falta totalInvestedBrl', () => {
    const v = valoresLinhaEua({
      item: { quantity: 4, avgPrice: 110, totalInvested: 440 },
      asset: REIT,
      quote: null,
      cotacaoDolar: 5.4,
    });
    expect(v).toMatchObject({
      moedaRegistro: 'USD',
      aproximado: false,
      semCambio: false,
      precoAquisicao: 110,
      valorTotal: 440,
      cotacaoAtual: 110,
      valorAtualizado: 440,
    });
    expect(v.valorTotalBRL).toBeCloseTo(2376);
    expect(v.valorAtualizadoBRL).toBeCloseTo(2376);
  });

  it("stock com moedaRegistro 'USD' usa totalInvestedBrl e a cotação em US$", () => {
    const v = valoresLinhaEua({
      item: {
        quantity: 2,
        avgPrice: 500,
        totalInvested: 1000,
        moedaRegistro: 'USD',
        totalInvestedBrl: 5100,
      },
      asset: STOCK_USD,
      quote: 512.4,
      cotacaoDolar: 5,
    });
    expect(v.valorAtualizado).toBeCloseTo(1024.8);
    expect(v.valorTotalBRL).toBe(5100);
    expect(v.valorAtualizadoBRL).toBeCloseTo(5124);
  });

  it('stock legado em R$: conta em R$ e exibe ÷ câmbio, marcada aproximado', () => {
    const v = valoresLinhaEua({
      item: { quantity: 2, avgPrice: 2500, totalInvested: 5000 },
      asset: STOCK_USD,
      quote: 510,
      cotacaoDolar: 5,
    });
    expect(v).toMatchObject({ moedaRegistro: 'BRL', aproximado: true, semCambio: false });
    expect(v.precoAquisicao).toBeCloseTo(500);
    expect(v.valorTotal).toBeCloseTo(1000);
    expect(v.cotacaoAtual).toBeCloseTo(510);
    expect(v.valorAtualizado).toBeCloseTo(1020);
    expect(v.valorTotalBRL).toBe(5000);
    expect(v.valorAtualizadoBRL).toBeCloseTo(5100);
  });

  it('stock legado em R$ sem câmbio: semCambio, zerada em US$', () => {
    const v = valoresLinhaEua({
      item: { quantity: 2, avgPrice: 2500, totalInvested: 5000 },
      asset: STOCK_USD,
      quote: 510,
      cotacaoDolar: null,
    });
    expect(v).toMatchObject({ semCambio: true, valorTotal: 0, valorAtualizado: 0 });
  });

  it('REIT sem câmbio continua em US$ (só o equivalente em R$ fica null)', () => {
    const v = valoresLinhaEua({
      item: { quantity: 4, avgPrice: 110, totalInvested: 440 },
      asset: REIT,
      quote: 118.2,
      cotacaoDolar: null,
    });
    expect(v.semCambio).toBe(false);
    expect(v.valorAtualizado).toBeCloseTo(472.8);
    expect(v.valorTotalBRL).toBeNull();
    expect(v.valorAtualizadoBRL).toBeNull();
  });
});

describe('proventoDaLinhaEmUsd', () => {
  it('ativo em dólar: valor nativo (US$); ativo BRL: ÷ câmbio', () => {
    expect(proventoDaLinhaEmUsd(2.5, REIT, 5)).toBe(2.5);
    expect(proventoDaLinhaEmUsd(10, { type: 'etf', currency: 'BRL' }, 5)).toBe(2);
    expect(proventoDaLinhaEmUsd(10, { type: 'etf', currency: 'BRL' }, null)).toBe(0);
  });
});

describe('totaisEua', () => {
  it('soma em US$, equivalente em R$ e deixa semCambio de fora', () => {
    const t = totaisEua(
      [
        {
          valorTotal: 440,
          valorAtualizado: 472.8,
          proventos: 2.5,
          valorTotalBRL: 2376,
          valorAtualizadoBRL: 472.8 * 5,
        },
        { valorTotal: 0, valorAtualizado: 0, semCambio: true },
      ],
      5,
    );
    expect(t.totalUSD.valorAplicado).toBe(440);
    expect(t.totalUSD.valorAtualizado).toBeCloseTo(472.8);
    expect(t.totalUSD.proventos).toBe(2.5);
    expect(t.totalBRL?.valorAplicado).toBe(2376);
    expect(t.totalBRL?.valorAtualizado).toBeCloseTo(2364);
    expect(t.posicoesSemCambio).toBe(1);
  });

  it('sem câmbio: totalBRL null', () => {
    expect(totaisEua([{ valorTotal: 1, valorAtualizado: 1 }], null).totalBRL).toBeNull();
  });
});
