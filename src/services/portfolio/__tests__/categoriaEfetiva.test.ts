import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { categoriaEfetiva, categorizarAsset, valuatePortfolioItem } from '../itemValuation';

// Contrato da fase 1: chave da fase 2 desligada (ligada: categoriaEfetiva.caixaRf.test.ts).
beforeAll(() => {
  vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'false');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const fii = { symbol: 'KDIF11', type: 'fii', currency: 'BRL', name: 'Kinea Infra' };
const item = { assetId: 'a-1', quantity: 10, avgPrice: 100, totalInvested: 1000 };

describe('categoriaEfetiva', () => {
  it('sem override = categorizarAsset', () => {
    expect(categoriaEfetiva(fii, null)).toBe('fiis');
    expect(categoriaEfetiva(fii, undefined)).toBe(categorizarAsset(fii));
  });

  it('override válido e ≠ base vale', () => {
    expect(categoriaEfetiva(fii, 'fimFia')).toBe('fimFia');
    expect(categoriaEfetiva(fii, 'acoes')).toBe('acoes');
  });

  it('override = base é ignorado', () => {
    expect(categoriaEfetiva(fii, 'fiis')).toBe('fiis');
  });

  it('override inválido é ignorado', () => {
    expect(categoriaEfetiva(fii, 'rendaFixaFundos')).toBe('fiis');
    expect(categoriaEfetiva(fii, 'qualquer')).toBe('fiis');
  });

  it('reserva ignora override', () => {
    expect(categoriaEfetiva(fii, 'acoes', { isReserva: true })).toBe('reservaOportunidade');
    expect(
      categoriaEfetiva({ symbol: 'TESOURO-1', type: 'tesouro-direto' }, 'acoes', {
        isReserva: true,
        tesouroReservaDestino: 'emergencia',
      }),
    ).toBe('reservaEmergencia');
  });

  it("item de aba fixa ('fixo') ignora override", () => {
    expect(categoriaEfetiva({ symbol: 'CDB-1', type: 'bond' }, 'acoes')).toBe('rendaFixaFundos');
    expect(categoriaEfetiva({ symbol: 'BTC', type: 'crypto' }, 'fiis')).toBe('moedasCriptos');
    // unit B3 fora de escopo (decisão 11): continua onde está
    expect(categoriaEfetiva({ symbol: 'TAEE11', type: 'stock', currency: 'BRL' }, 'acoes')).toBe(
      'rendaFixaFundos',
    );
  });

  it("'fund' legado HGLG11: base da aba é Fundos; override para FII's vale", () => {
    const legado = { symbol: 'HGLG11', type: 'fund', currency: 'BRL', name: 'CSHG Log' };
    expect(categoriaEfetiva(legado, 'fiis')).toBe('fiis');
    expect(categoriaEfetiva(legado, 'acoes')).toBe('acoes');
  });
});

describe('valuatePortfolioItem com override', () => {
  it('muda só a categoria — valor, aplicado e fonte iguais', () => {
    const sem = valuatePortfolioItem({ item, asset: fii, quote: 120 });
    const com = valuatePortfolioItem({
      item: { ...item, categoriaOverride: 'fimFia' },
      asset: fii,
      quote: 120,
    });
    expect(sem.categoria).toBe('fiis');
    expect(com.categoria).toBe('fimFia');
    expect(com.valorAtualBRL).toBe(sem.valorAtualBRL);
    expect(com.valorAplicadoBRL).toBe(sem.valorAplicadoBRL);
    expect(com.fonte).toBe(sem.fonte);
    expect(com.contaNoSaldoBruto).toBe(sem.contaNoSaldoBruto);
  });

  it('USD movido entre Stocks e REITs mantém a conversão', () => {
    const stock = { symbol: 'MSFT', type: 'stock', currency: 'USD' };
    const v = valuatePortfolioItem({
      item: { ...item, categoriaOverride: 'reits' },
      asset: stock,
      quote: 10,
      cotacaoDolar: 5,
    });
    expect(v.categoria).toBe('reits');
    expect(v.valorAtualBRL).toBe(500);
  });

  it('override nulo: idêntico ao comportamento anterior', () => {
    const a = valuatePortfolioItem({ item, asset: fii, quote: 120 });
    const b = valuatePortfolioItem({
      item: { ...item, categoriaOverride: null },
      asset: fii,
      quote: 120,
    });
    expect(b).toEqual(a);
  });
});
