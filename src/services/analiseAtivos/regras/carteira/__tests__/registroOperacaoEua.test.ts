import { describe, expect, it } from 'vitest';
import {
  montarCorpoCompra,
  montarCorpoVenda,
  precoNaCarteira,
  tipoOperacaoEua,
  totalEmReais,
  validarOperacao,
} from '../registroOperacao';

/**
 * Registrar operação de Stocks/REITs pela Análise (fatia D): o MESMO corpo do wizard da Carteira
 * (Step4StocksFields / Step4ReitFields), com o Asset manual da posição na recompra.
 */
const base = {
  ticker: 'aapl',
  instituicaoId: 'inst-1',
  data: '2026-10-16',
  quantidade: 3,
  cotacao: 200,
  cambio: 5.5,
  secao: 'growth',
};

describe('montarCorpoCompra — EUA', () => {
  it('stock sem posição: STOCK-MANUAL, US$ + câmbio, sem valorInvestido, e estratégia', () => {
    expect(montarCorpoCompra({ ...base, classe: 'stock', assetId: null })).toEqual({
      tipoAtivo: 'stock',
      assetId: 'STOCK-MANUAL',
      ativo: 'AAPL',
      instituicaoId: 'inst-1',
      dataCompra: '2026-10-16',
      quantidade: 3,
      cotacaoUnitaria: 200,
      cotacaoMoeda: 5.5,
      taxaCorretagem: 0,
      estrategia: 'growth',
    });
  });

  it('recompra: manda o Asset manual da posição (não cria outro)', () => {
    const c = montarCorpoCompra({
      ...base,
      classe: 'stock',
      ticker: 'BRK.B',
      assetId: 'a-brkb',
      tipoAsset: 'stock',
    });
    expect(c).toMatchObject({ assetId: 'a-brkb', ativo: 'BRK.B', tipoAtivo: 'stock' });
  });

  it('REIT sem posição: REIT-MANUAL, US$ + câmbio e estrategiaReit', () => {
    expect(montarCorpoCompra({ ...base, classe: 'reit', ticker: 'o', assetId: null })).toEqual({
      tipoAtivo: 'reit',
      assetId: 'REIT-MANUAL',
      ativo: 'O',
      instituicaoId: 'inst-1',
      dataCompra: '2026-10-16',
      quantidade: 3,
      cotacaoUnitaria: 200,
      cotacaoMoeda: 5.5,
      taxaCorretagem: 0,
      estrategiaReit: 'growth',
    });
  });

  it('o tipo do Asset existente vence a classe (REIT lançado como stock na Carteira)', () => {
    expect(tipoOperacaoEua('reit', 'stock')).toBe('stock');
    expect(tipoOperacaoEua('reit')).toBe('reit');
    expect(
      montarCorpoCompra({ ...base, classe: 'reit', assetId: 'a-o', tipoAsset: 'stock' }).tipoAtivo,
    ).toBe('stock');
  });

  it('Brasil não muda: acao/fii com o Asset do catálogo', () => {
    expect(
      montarCorpoCompra({ ...base, classe: 'acao', ticker: 'wege3', assetId: 'a-wege' }),
    ).toMatchObject({ tipoAtivo: 'acao', assetId: 'a-wege', estrategia: 'growth' });
    expect(
      montarCorpoCompra({ ...base, classe: 'acao', ticker: 'wege3', assetId: 'a-wege' }),
    ).not.toHaveProperty('cotacaoMoeda');
  });
});

describe('montarCorpoVenda — EUA', () => {
  it('stock: preço em US$ + cotacaoMoeda (a rota converte para a unidade da posição)', () => {
    expect(
      montarCorpoVenda({
        portfolioId: 'p-1',
        data: '2026-10-16',
        quantidade: 1,
        cotacao: 210.1,
        classe: 'stock',
        cambio: 5.4,
      }),
    ).toEqual({
      portfolioId: 'p-1',
      dataResgate: '2026-10-16',
      metodoResgate: 'quantidade',
      quantidade: 1,
      cotacaoUnitaria: 210.1,
      cotacaoMoeda: 5.4,
    });
  });

  it('REIT: preço em US$', () => {
    expect(
      montarCorpoVenda({
        portfolioId: 'p-o',
        data: '2026-10-16',
        quantidade: 2,
        cotacao: 57,
        classe: 'reit',
        cambio: 5.4,
      }),
    ).toMatchObject({ cotacaoUnitaria: 57, cotacaoMoeda: 5.4 });
  });

  it('Brasil: sem cotacaoMoeda', () => {
    expect(
      montarCorpoVenda({ portfolioId: 'p', data: '2026-10-16', quantidade: 1, cotacao: 40 }),
    ).not.toHaveProperty('cotacaoMoeda');
  });
});

describe('preço, total e validação EUA', () => {
  it('precoNaCarteira e totalEmReais', () => {
    expect(precoNaCarteira({ classe: 'stock', cotacao: 200, cambio: 5.5 })).toBe(200);
    expect(precoNaCarteira({ classe: 'reit', cotacao: 57, cambio: 5.5 })).toBe(57);
    expect(precoNaCarteira({ classe: 'acao', cotacao: 40 })).toBe(40);
    expect(totalEmReais({ classe: 'reit', quantidade: 2, cotacao: 50, cambio: 5 })).toBe(500);
    expect(totalEmReais({ classe: 'fii', quantidade: 2, cotacao: 10 })).toBe(20);
  });

  it('câmbio vazio ou ≤ 0 → cambio_invalido; sem o campo, nada muda', () => {
    const v = {
      operacao: 'compra' as const,
      quantidade: 1,
      data: '2026-10-16',
      hoje: '2026-10-17',
      posicao: null,
      cotacao: 10,
    };
    expect(validarOperacao({ ...v, cambio: null })).toEqual(['cambio_invalido']);
    expect(validarOperacao({ ...v, cambio: 0 })).toEqual(['cambio_invalido']);
    expect(validarOperacao({ ...v, cambio: 5.4 })).toEqual([]);
    expect(validarOperacao(v)).toEqual([]);
  });
});
