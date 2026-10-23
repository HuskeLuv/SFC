import { describe, expect, it } from 'vitest';
import { montarCorpoCompra, montarCorpoVenda, precoNaCarteira } from '../registroOperacao';

/**
 * Carteira EUA em US$ (fatia FA): o modal "Registrar operação" manda o MESMO corpo para stock e
 * REIT — preço em US$ + câmbio, sem valorInvestido — e a rota decide a unidade pela posição.
 */
const entrada = {
  ticker: 'xyz',
  instituicaoId: 'inst-1',
  data: '2026-10-20',
  quantidade: 4,
  cotacao: 125.5,
  cambio: 5.3,
  secao: 'value',
};

/** Corpo sem os campos que naturalmente diferem (tipo, Asset e o nome do campo da seção). */
const nucleo = (c: Record<string, unknown>) => {
  const {
    tipoAtivo: _t,
    assetId: _a,
    estrategia: _e,
    estrategiaReit: _r,
    ...resto
  } = c as Record<string, unknown>;
  return resto;
};

describe('registroOperacao — corpo EUA único (stock = REIT)', () => {
  it('compra: o corpo do stock é o corpo do REIT', () => {
    const stock = montarCorpoCompra({ ...entrada, classe: 'stock', assetId: null });
    const reit = montarCorpoCompra({ ...entrada, classe: 'reit', assetId: null });
    expect(nucleo(stock as unknown as Record<string, unknown>)).toEqual(
      nucleo(reit as unknown as Record<string, unknown>),
    );
    expect(stock).toMatchObject({ estrategia: 'value', cotacaoUnitaria: 125.5, cotacaoMoeda: 5.3 });
    expect(reit).toMatchObject({ estrategiaReit: 'value', cotacaoUnitaria: 125.5 });
    for (const corpo of [stock, reit]) {
      expect(corpo).not.toHaveProperty('valorInvestido');
      expect(corpo).not.toHaveProperty('moeda');
    }
  });

  it('venda: preço em US$ e cotacaoMoeda nas duas classes', () => {
    const venda = (classe: 'stock' | 'reit') =>
      montarCorpoVenda({
        portfolioId: 'p-1',
        data: '2026-10-20',
        quantidade: 2,
        cotacao: 130,
        classe,
        cambio: 5.2,
      });
    expect(venda('stock')).toEqual(venda('reit'));
    expect(venda('stock')).toMatchObject({ cotacaoUnitaria: 130, cotacaoMoeda: 5.2 });
  });

  it('precoNaCarteira devolve a cotação em US$ (stock e REIT)', () => {
    expect(precoNaCarteira({ classe: 'stock', cotacao: 125.5, cambio: 5.3 })).toBe(125.5);
    expect(
      precoNaCarteira({ classe: 'reit', cotacao: 125.5, cambio: 5.3, tipoAsset: 'stock' }),
    ).toBe(125.5);
  });

  it('Brasil não muda: valorInvestido em R$, sem câmbio', () => {
    expect(montarCorpoCompra({ ...entrada, classe: 'acao', assetId: 'a-1' })).toMatchObject({
      tipoAtivo: 'acao',
      valorInvestido: 502,
    });
  });
});
