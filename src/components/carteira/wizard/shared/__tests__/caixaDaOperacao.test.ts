import { describe, it, expect } from 'vitest';
import { abaDaCompra, valorDaCompraBRL } from '../caixaDaOperacao';

/**
 * ETF americano em US$ (ticket 86e3fq1yh, fatia FB): a prévia do Caixa para Investir converte o
 * ETF-MANUAL (q × preço US$ × câmbio + corretagem R$); o ETF da B3 continua q × preço + corretagem.
 */
type Form = Parameters<typeof valorDaCompraBRL>[0];
const form = (over: Partial<Form> = {}): Form =>
  ({
    tipoAtivo: 'etf',
    assetId: 'ETF-MANUAL',
    quantidade: 10,
    cotacaoUnitaria: 500,
    cotacaoMoeda: 5,
    taxaCorretagem: 10,
    ...over,
  }) as Form;

describe('valorDaCompraBRL — ETF', () => {
  it('ETF-MANUAL: q × p × câmbio + corretagem', () => {
    expect(valorDaCompraBRL(form())).toBeCloseTo(10 * 500 * 5 + 10, 6); // 25.010
  });

  it('ETF do catálogo (IVVB11): igual a hoje, ignora câmbio que tenha sobrado', () => {
    expect(valorDaCompraBRL(form({ assetId: 'uuid-ivvb11', cotacaoUnitaria: 300 }))).toBe(3010);
    expect(valorDaCompraBRL(form({ assetId: undefined, cotacaoUnitaria: 300 }))).toBe(3010);
  });

  it('ETF manual e da B3 usam a mesma aba do caixa', () => {
    expect(abaDaCompra(form())).toBe('etf');
    expect(abaDaCompra(form({ assetId: 'uuid-ivvb11' }))).toBe('etf');
  });
});
