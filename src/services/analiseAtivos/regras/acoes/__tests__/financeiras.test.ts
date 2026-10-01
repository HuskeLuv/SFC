import { describe, expect, it } from 'vitest';
import { metricasNaoAplicaveis } from '@/services/analiseAtivos/regras/acoes/financeiras';
import { extrairFundamentos } from '@/services/analiseAtivos/regras/acoes/extrairFundamentos';
import { ehLayoutFinanceiro } from '@/services/analiseAtivos/regras/acoes/layoutFinanceiro';
import { CNPJ, filtrar, lerFixture } from '@/services/analiseAtivos/regras/acoes/__tests__/helpers';

const fin = lerFixture('dre_financeiras.csv');
const bp = lerFixture('bp_wege_bbas_2024.csv');

function extrair(cnpj: string, escopo: 'con' | 'ind', dtFim: string, extra = bp) {
  const linhas = [...filtrar(fin, { cnpj, escopo }), ...filtrar(extra, { cnpj, escopo })];
  return extrairFundamentos(linhas, {
    demonstrativos: new Set(['DRE', 'BPA', 'BPP']),
    ehFinanceira: ehLayoutFinanceiro(linhas),
    tipoPeriodo: 'FY',
    escopo,
    dtIni: `${dtFim.slice(0, 4)}-01-01`,
    dtFim,
    mesFimExercicio: 12,
  });
}

describe('metricasNaoAplicaveis (regra 15 na ingestão)', () => {
  it('BBSE3 2025: receita 3.01 = 0 ⇒ margens e P/Receita n/a (receita não positiva)', () => {
    const f = extrair(CNPJ.BBSE3, 'con', '2025-12-31', []);
    expect(f.receita).toBe(0);
    expect(f.lucroAtribuivel).toBeCloseTo(9_017_329_000, 0);
    const m = metricasNaoAplicaveis({ layoutFinanceiro: false, receita: f.receita, lucro: 9e9 });
    expect(m.get('margemLiquidaPct')).toBe('receita_nao_positiva');
    expect(m.get('pReceita')).toBe('receita_nao_positiva');
    expect(f.naoSeAplica).toEqual(expect.arrayContaining(['margemLiquidaPct', 'pReceita']));
  });

  it('ITSA4 2025: receita 8,2 bi ≤ lucro atribuível 16,5 bi ⇒ margens e P/Receita n/a', () => {
    const f = extrair(CNPJ.ITSA4, 'con', '2025-12-31', []);
    expect(f.receita).toBeCloseTo(8_249_000_000, 0);
    expect(f.lucroAtribuivel).toBeCloseTo(16_487_000_000, 0);
    const m = metricasNaoAplicaveis({
      layoutFinanceiro: false,
      receita: f.receita,
      lucro: f.lucroAtribuivel,
    });
    expect(m.get('margemLiquidaPct')).toBe('receita_menor_que_lucro');
    expect(m.get('pReceita')).toBe('receita_menor_que_lucro');
    expect(m.has('ebit')).toBe(false);
  });

  it('BBAS3 2024 (DRE de banco) ⇒ layoutFinanceiro e EBIT/D&A/AC/PC/liquidez n/a — valores null, não zero', () => {
    const con = extrair(CNPJ.BBAS3, 'con', '2024-12-31');
    expect(con.ebit).toBeNull();
    expect(con.depreciacaoAmortizacao).toBeNull();
    expect(con.ativoCirculante).toBeNull();
    expect(con.passivoCirculante).toBeNull();
    expect(con.naoSeAplica).toEqual(
      expect.arrayContaining([
        'ebit',
        'depreciacaoAmortizacao',
        'ativoCirculante',
        'passivoCirculante',
        'liquidezCorrente',
        'divLiqEbitda',
      ]),
    );
    expect(con.padraoContabil).toBe('IFRS');
    // o documento tem 3.05 (Resultado antes dos Tributos) e 1.01 (Caixa) — nunca viram EBIT/AC
    expect(con.receita).toBeCloseTo(273_505_274_000, 0);
    expect(con.caixa).not.toBeNull();
  });

  it('BBAS3 individual (BR GAAP, decisão 3): mesmo n/a e padrão contábil BRGAAP', () => {
    const ind = extrair(CNPJ.BBAS3, 'ind', '2024-12-31', []);
    expect(ind.padraoContabil).toBe('BRGAAP');
    expect(ind.ebit).toBeNull();
    expect(ind.naoSeAplica).toContain('ebit');
    expect(ind.lucroAtribuivel).toBeCloseTo(35_260_189_000, 0);
  });

  it('receita ausente não decide nada (ausente ≠ n/a); não financeira com receita > lucro ⇒ vazio', () => {
    expect(metricasNaoAplicaveis({ layoutFinanceiro: false, receita: null, lucro: 1 }).size).toBe(
      0,
    );
    expect(metricasNaoAplicaveis({ layoutFinanceiro: false, receita: 10, lucro: 1 }).size).toBe(0);
  });
});
