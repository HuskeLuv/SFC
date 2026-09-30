import { describe, expect, it } from 'vitest';
import {
  extrairFundamentos,
  type ContextoExtracao,
} from '@/services/analiseAtivos/regras/acoes/extrairFundamentos';
import {
  CNPJ,
  filtrar,
  lerFixture,
  mi,
} from '@/services/analiseAtivos/regras/acoes/__tests__/helpers';

const dre = lerFixture('dre_wege_petr_2024.csv');
const bp = lerFixture('bp_wege_bbas_2024.csv');
const dfc = lerFixture('dfc_wege_2024.csv');
const dmpl = lerFixture('dmpl_petr_2024.csv');

const ctx = (extra: Partial<ContextoExtracao> = {}): ContextoExtracao => ({
  demonstrativos: new Set(['DRE', 'BPA', 'BPP', 'DFC_MI', 'DMPL']),
  ehFinanceira: false,
  tipoPeriodo: 'FY',
  escopo: 'con',
  dtIni: '2024-01-01',
  dtFim: '2024-12-31',
  mesFimExercicio: 12,
  ...extra,
});

describe('extrairFundamentos — WEGE3 2024 (DFP consolidado)', () => {
  const linhas = [
    ...filtrar(dre, { cnpj: CNPJ.WEGE3 }),
    ...filtrar(bp, { cnpj: CNPJ.WEGE3 }),
    ...filtrar(dfc, { cnpj: CNPJ.WEGE3 }),
  ];
  const f = extrairFundamentos(
    linhas,
    ctx({ demonstrativos: new Set(['DRE', 'BPA', 'BPP', 'DFC_MI']) }),
  );

  it('receita 37.986,9 mi e lucro atribuível 6.042,6 mi', () => {
    expect(mi(f.receita)).toBe(37986.9);
    expect(mi(f.lucroAtribuivel)).toBe(6042.6);
    expect(mi(f.lucroLiquido)).toBe(6318.8);
    expect(f.codContaLucro).toBe('3.11.01');
  });

  it('balanço e fluxo de caixa com as contas fixas', () => {
    expect(f.ativoTotal).not.toBeNull();
    expect(f.ativoCirculante).not.toBeNull();
    expect(f.passivoCirculante).not.toBeNull();
    expect(f.pl).not.toBeNull();
    expect(f.plControladora).not.toBeNull();
    expect(f.plControladora!).toBeLessThanOrEqual(f.pl!);
    expect(mi(f.fco)).toBe(7252.3);
    expect(mi(f.fci)).toBe(-4094.6);
    expect(mi(f.fcf)).toBe(-2764.2);
    // "Depreciação, Amortização e Exaustão" (6.01.01.02); "Juros Provisionados de Empréstimos" fica de fora
    expect(mi(f.depreciacaoAmortizacao)).toBe(812.5);
    // 6.02.02 Imobilizado + 6.02.03 Intangível (a venda de imobilizado 6.02.04 fica de fora)
    expect(mi(f.capex)).toBe(1850.3);
    expect(mi(f.dividendosJcpPagos)).toBe(2934.6);
    expect(f.lpaOn).toBe(1.44026);
    expect(f.lpaPn).toBeNull();
    expect(f.naoSeAplica).toEqual([]);
    expect(f.padraoContabil).toBe('IFRS');
    expect(f.anoFiscal).toBe(2024);
    expect(f.trimestreFiscal).toBeNull();
  });

  it('DMPL não informado ⇒ dmplDeclarado ausente (null), não zero', () => {
    expect(f.dmplDeclarado).toBeNull();
  });
});

describe('extrairFundamentos — PETR4 2024', () => {
  const linhas = [...filtrar(dre, { cnpj: CNPJ.PETR4 }), ...filtrar(dmpl, { cnpj: CNPJ.PETR4 })];
  const f = extrairFundamentos(linhas, ctx());

  it('lucro atribuível 36.606 mi', () => {
    expect(Math.round(f.lucroAtribuivel! / 1e6)).toBe(36_606);
  });

  it('DMPL "declarado no ano" = 100,9 bi (coluna do PL da controladora; prescritos fora) ⇒ payout DMPL ≈ 275%', () => {
    expect(mi(f.dmplDeclarado)).toBe(100900);
    const payout = (f.dmplDeclarado! / f.lucroAtribuivel!) * 100;
    expect(payout).toBeGreaterThan(274);
    expect(payout).toBeLessThan(276);
  });

  it('sem DFC no recorte ⇒ FCO/capex/dividendos pagos ausentes (null)', () => {
    const semDfc = extrairFundamentos(linhas, ctx({ demonstrativos: new Set(['DRE', 'DMPL']) }));
    expect(semDfc.fco).toBeNull();
    expect(semDfc.capex).toBeNull();
    expect(semDfc.dividendosJcpPagos).toBeNull();
  });
});

describe('extrairFundamentos — período trimestral', () => {
  it('3M/YTD ganham trimestre fiscal e não têm DMPL', () => {
    const f = extrairFundamentos(filtrar(dre, { cnpj: CNPJ.WEGE3 }), {
      ...ctx({ tipoPeriodo: '3M', dtIni: '2024-04-01', dtFim: '2024-06-30' }),
    });
    expect(f.trimestreFiscal).toBe(2);
    expect(f.dmplDeclarado).toBeNull();
  });
});
