import { describe, expect, it } from 'vitest';
import { perfilCriteriosEua } from '@/services/analiseAtivos/regras/criterios/perfilCriteriosEua';

describe('perfilCriteriosEua', () => {
  it('stock não financeiro = stock; financeira (flag do cadastro) = stock_financeira', () => {
    expect(perfilCriteriosEua({ classe: 'stock', ehFinanceira: false, sic: 3571 })).toBe('stock');
    expect(perfilCriteriosEua({ classe: 'stock', ehFinanceira: true, sic: 6021 })).toBe(
      'stock_financeira',
    );
  });

  it('a flag do cadastro (override por CIK) vence o SIC', () => {
    expect(perfilCriteriosEua({ classe: 'stock', ehFinanceira: false, sic: 6021 })).toBe('stock');
  });

  it('sem a flag, pela faixa de SIC 6000–6799 exceto 6798', () => {
    expect(perfilCriteriosEua({ classe: 'stock', sic: 6331 })).toBe('stock_financeira');
    expect(perfilCriteriosEua({ classe: 'stock', sic: 6798 })).toBe('stock');
    expect(perfilCriteriosEua({ classe: 'stock', sic: null })).toBe('stock');
  });

  it('REIT = reit (mesmo com SIC/flag de financeira)', () => {
    expect(perfilCriteriosEua({ classe: 'reit', ehFinanceira: true, sic: 6798 })).toBe('reit');
  });
});
