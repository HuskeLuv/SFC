import { describe, expect, it } from 'vitest';
import { multiplosEua } from '@/services/analiseAtivos/calculo/multiplosEua';
import type { FySec } from '@/services/analiseAtivos/regras/criterios/seriesStock';
import fixture from '../../regras/criterios/__tests__/fixtures/eua-dev.json';

const EMPRESAS = fixture.empresas as unknown as Array<{ symbol: string; fys: FySec[] }>;
const fys = (s: string) => (EMPRESAS.find((e) => e.symbol === s) as { fys: FySec[] }).fys;

describe('multiplosEua', () => {
  it('AAPL: último FY (2025), só fundamentos — sem preço, P/L, P/VP e DY ficam null', () => {
    const m = multiplosEua(fys('AAPL'));
    expect(m.anoFiscal).toBe(2025);
    expect(m.margemLiquidaPct).toBeCloseTo((112010 / 416161) * 100, 0);
    expect(m.divLiqEbitda).toBeCloseTo(0.25, 1);
    expect(m.dpa).toBeCloseTo(1.02, 2);
    expect(m.anosLucroConsecutivos).toBe(12);
    expect(m.anosDividendo).toBe(12);
    expect(m.pl).toBeNull();
    expect(m.pvp).toBeNull();
    expect(m.dy12mPct).toBeNull();
    // serie10a: 10 últimos FY, lucro em US$ mi
    expect(m.serie10a).toHaveLength(10);
    expect(m.serie10a[m.serie10a.length - 1]).toEqual({ ano: 2025, valor: 112010 });
  });

  it('O: FCO/ação e dividendos/FCO do último FY', () => {
    const m = multiplosEua(fys('O'));
    expect(m.fcoPorAcao).toBeCloseTo(4.4, 2);
    expect(m.dividendosFcoPct).toBeCloseTo(73.1, 0);
    expect(m.payoutPct).toBeGreaterThan(100);
  });

  it('JPM: sem dívida tagueada ⇒ Dív.líq/EBITDA e Dív.líq/PL null', () => {
    const m = multiplosEua(fys('JPM'));
    expect(m.divLiqEbitda).toBeNull();
    expect(m.divLiqPl).toBeNull();
    expect(m.roePct).toBeGreaterThan(0);
  });

  it('BRK.B: prejuízo em 2022 interrompe os anos seguidos de lucro', () => {
    expect(multiplosEua(fys('BRK.B')).anosLucroConsecutivos).toBe(3);
  });

  it('com preço (só com a chave EUA_PRECO): P/L = preço ÷ LPA, DY = DPA ÷ preço', () => {
    const m = multiplosEua(fys('AAPL'), 250);
    const ult = fys('AAPL').find((f) => f.anoFiscal === 2025) as FySec;
    const lpa = (ult.lucroAtribuivel as number) / (ult.acoesMediaDiluida as number);
    expect(m.pl).toBeCloseTo(250 / lpa, 2);
    expect(m.dy12mPct).toBeCloseTo((1.02 / 250) * 100, 2);
  });

  it('sem FY: tudo null e série vazia', () => {
    expect(multiplosEua([])).toMatchObject({
      anoFiscal: null,
      roePct: null,
      serie10a: [],
      fcoAjustadoPorAcao: null,
      dividendosFcoAjustadoPct: null,
    });
  });

  // fundamentei-regras F3 (A2.d)
  it('caixa operacional ajustado pela SBC: sem SBC = null; com SBC, sem mexer nas antigas', () => {
    const sem = multiplosEua(fys('O'));
    expect(sem.fcoAjustadoPorAcao).toBeNull();
    expect(sem.dividendosFcoAjustadoPct).toBeNull();
    const ultimo = Math.max(...fys('O').map((f) => f.anoFiscal));
    const comSbc = fys('O').map((f) =>
      f.anoFiscal === ultimo ? { ...f, remuneracaoAcoes: (f.fco as number) * 0.1 } : f,
    );
    const com = multiplosEua(comSbc);
    expect(com.fcoAjustadoPorAcao).toBeCloseTo((sem.fcoPorAcao as number) * 0.9, 3);
    expect(com.dividendosFcoAjustadoPct).toBeCloseTo((sem.dividendosFcoPct as number) / 0.9, 1);
    const { fcoAjustadoPorAcao: _a, dividendosFcoAjustadoPct: _b, ...antigasCom } = com;
    const { fcoAjustadoPorAcao: _c, dividendosFcoAjustadoPct: _d, ...antigasSem } = sem;
    expect(antigasCom).toEqual(antigasSem);
    // SBC ≥ FCO: caixa ajustado ≤ 0 = null na coluna (sem ∞)
    const negativo = fys('O').map((f) =>
      f.anoFiscal === ultimo ? { ...f, remuneracaoAcoes: (f.fco as number) * 2 } : f,
    );
    expect(multiplosEua(negativo).dividendosFcoAjustadoPct).toBeNull();
  });
});
