/**
 * Séries de Stocks e REITs (fatia B) contra a fixture RECORTADA de companyfacts da SEC
 * (fixtures/eua-dev.json, 26 empresas, FY 2014–2025) e contra a medição do desenho
 * (docs/analise-ativos/stocks-reits/medicao-criterios.json → amostra2021_2025).
 */
import { describe, expect, it } from 'vitest';
import {
  dividaLiquidaSec,
  dlEbitdaSec,
  ebitdaSec,
  fysSecPorAno,
  seriesStock,
  valoresAnoStock,
  type BrutoSec,
  type FySec,
} from '@/services/analiseAtivos/regras/criterios/seriesStock';
import {
  dividendosFcoPctSec,
  dpaSec,
  seriesReit,
  valoresAnoReit,
} from '@/services/analiseAtivos/regras/criterios/seriesReit';
import fixture from './fixtures/eua-dev.json';

interface EmpresaFixture {
  symbol: string;
  cik: string;
  classe: 'stock' | 'reit';
  ehFinanceira: boolean;
  fys: FySec[];
}
const EMPRESAS = fixture.empresas as unknown as EmpresaFixture[];

function bruto(symbol: string): BrutoSec {
  const e = EMPRESAS.find((x) => x.symbol === symbol);
  if (!e) throw new Error(`${symbol} fora da fixture`);
  return { cik: e.cik, fys: e.fys };
}

const ANOS = [2021, 2022, 2023, 2024, 2025];
const daJanela = (serie: Record<number, number | null> | undefined) =>
  ANOS.map((a) => serie?.[a] ?? null);

function fy(parcial: Partial<FySec>): FySec {
  return {
    emissorId: 'CIK:0000000001',
    dtFim: '2025-12-31',
    versao: 1,
    anoFiscal: 2025,
    receita: null,
    ebit: null,
    depreciacaoAmortizacao: null,
    lucroLiquido: null,
    lucroAtribuivel: null,
    caixa: null,
    aplicacoesFinanceiras: null,
    dividaBrutaCp: null,
    dividaBrutaLp: null,
    fco: null,
    capex: null,
    dividendosJcpPagos: null,
    recompras: null,
    pl: null,
    acoesMediaDiluida: null,
    dpa: null,
    dpaOrigem: null,
    flags: [],
    ...parcial,
  };
}

describe('fixture eua-dev.json', () => {
  it('26 empresas (11 stocks, 15 REITs), FY até 2025, todas com o CIK no emissorId', () => {
    expect(EMPRESAS).toHaveLength(26);
    expect(EMPRESAS.filter((e) => e.classe === 'stock')).toHaveLength(11);
    for (const e of EMPRESAS) {
      expect(e.fys.length).toBeGreaterThan(0);
      for (const f of e.fys) {
        expect(f.emissorId).toBe(`CIK:${e.cik}`);
        expect(f.anoFiscal).toBeLessThanOrEqual(2025);
      }
    }
  });
});

describe('REIT — medição do desenho', () => {
  it('O: FCO/ação 2021–2025 = 3,19 4,19 4,27 4,14 4,40 (cai em 2024: fco_acao não atende)', () => {
    const s = seriesReit(bruto('O'));
    daJanela(s.ocf_per_share).forEach((v, i) =>
      expect(v).toBeCloseTo([3.19, 4.19, 4.27, 4.14, 4.4][i], 2),
    );
  });

  it('PLD: Dividendos/FCO 2021–2025 = 62,5 … 75,2% (≤ 90%: pay atende)', () => {
    const s = seriesReit(bruto('PLD'));
    daJanela(s.cash_payout_pct).forEach((v, i) =>
      expect(v).toBeCloseTo([62.51, 60.46, 60.09, 72.69, 75.17][i], 1),
    );
  });

  it('PLD: DPA pago (o Declared de 0,01 é erro de tag e não entra)', () => {
    const s = seriesReit(bruto('PLD'));
    daJanela(s.dividend_per_share).forEach((v, i) =>
      expect(v).toBeCloseTo([2.52, 3.16, 3.48, 3.84, 4.04][i], 2),
    );
  });

  it('O: receita em US$ mi e Dív.líq/EBITDA acima de 6× em 2021 (fusão VEREIT)', () => {
    const s = seriesReit(bruto('O'));
    daJanela(s.revenue).forEach((v, i) =>
      expect(v).toBeCloseTo([2080, 3344, 4079, 5271, 5749][i], -1),
    );
    expect(s.net_debt_ebitda?.[2021]).toBeGreaterThan(6);
  });

  it('ARE/CPT/BXP/AMH: EBITDA pelo 3º degrau (lucro + IR + juros + D&A) com dado em 2025', () => {
    for (const symbol of ['ARE', 'CPT', 'BXP', 'AMH']) {
      const fys = fysSecPorAno(bruto(symbol).fys);
      const f2025 = fys.get(2025) as FySec;
      expect(f2025.flags).toContain('ebitda_lucro');
      expect(valoresAnoReit(f2025).net_debt_ebitda).not.toBeNull();
    }
  });

  it('ocupação nunca tem ponto (não existe no XBRL)', () => {
    for (const e of EMPRESAS.filter((x) => x.classe === 'reit')) {
      expect(seriesReit(bruto(e.symbol)).occupancy).toBeUndefined();
    }
  });
});

describe('Stock — medição do desenho', () => {
  it('AAPL: receita, lucro e EBITDA (US$ mi) 2021–2025 = medição', () => {
    const s = seriesStock(bruto('AAPL'));
    const med = {
      revenue: [365817, 394328, 383285, 391035, 416161],
      net_income: [94680, 99803, 96995, 93736, 112010],
      ebitda: [120233, 130541, 125820, 134661, 144748],
      free_cash_flow: [92953, 111443, 99584, 108807, 98767],
    } as const;
    for (const [serie, valores] of Object.entries(med)) {
      daJanela(s[serie as keyof typeof med]).forEach((v, i) =>
        expect(v).toBeCloseTo(valores[i], -1),
      );
    }
  });

  it('AAPL: Dív.líq/EBITDA (dívida bruta − caixa − aplicações de curto prazo) = medição', () => {
    const s = seriesStock(bruto('AAPL'));
    daJanela(s.net_debt_ebitda).forEach((v, i) =>
      expect(v).toBeCloseTo([0.47, 0.47, 0.35, 0.23, 0.25][i], 1),
    );
  });

  it('JPM e BRK.B: sem dívida tagueada = Dív.líq/EBITDA sem dado; JPM sem CAPEX = FCL sem dado', () => {
    const jpm = seriesStock(bruto('JPM'));
    const brk = seriesStock(bruto('BRK.B'));
    expect(daJanela(jpm.net_debt_ebitda)).toEqual([null, null, null, null, null]);
    expect(daJanela(brk.net_debt_ebitda)).toEqual([null, null, null, null, null]);
    expect(daJanela(jpm.free_cash_flow)).toEqual([null, null, null, null, null]);
    // JPM: EBITDA pelo 2º degrau (pré-IR + juros + D&A)
    expect(fysSecPorAno(bruto('JPM').fys).get(2025)?.flags).toContain('ebitda_pre_ir');
    expect(jpm.ebitda?.[2025]).not.toBeNull();
  });

  it('GOOGL: D&A só a partir de 2021 ⇒ EBITDA sem dado antes (a SEC não tem a tag)', () => {
    const s = seriesStock(bruto('GOOGL'));
    expect(s.ebitda?.[2019]).toBeNull();
    expect(s.ebitda?.[2022]).not.toBeNull();
  });

  it('BRK.B: prejuízo em 2022 deixa a margem negativa', () => {
    expect(seriesStock(bruto('BRK.B')).net_margin?.[2022]).toBeLessThan(0);
  });
});

describe('regras puras', () => {
  it('FY vigente: maior versão por dtFim; no ano, o dtFim mais recente', () => {
    const porAno = fysSecPorAno([
      fy({ dtFim: '2025-01-31', anoFiscal: 2024, versao: 1, receita: 100 }),
      fy({ dtFim: '2025-01-31', anoFiscal: 2024, versao: 2, receita: 110 }),
      fy({ dtFim: '2024-02-02', anoFiscal: 2023, versao: 1, receita: 90 }),
    ]);
    expect([...porAno.keys()]).toEqual([2023, 2024]);
    expect(porAno.get(2024)?.receita).toBe(110);
  });

  it('EBITDA exige D&A; DL exige dívida e caixa (aplicações ausentes = 0)', () => {
    expect(ebitdaSec({ ebit: 10, depreciacaoAmortizacao: null })).toBeNull();
    expect(ebitdaSec({ ebit: 10, depreciacaoAmortizacao: 5 })).toBe(15);
    const base = {
      dividaBrutaCp: null,
      dividaBrutaLp: 100,
      caixa: 30,
      aplicacoesFinanceiras: null,
    };
    expect(dividaLiquidaSec(base)).toBe(70);
    expect(dividaLiquidaSec({ ...base, aplicacoesFinanceiras: 20 })).toBe(50);
    expect(dividaLiquidaSec({ ...base, dividaBrutaLp: null })).toBeNull();
    expect(dividaLiquidaSec({ ...base, caixa: null })).toBeNull();
  });

  it('EBITDA ≤ 0 com DL > 0 = +∞; caixa líquido = dentro (0 com EBITDA ≤ 0)', () => {
    expect(dlEbitdaSec(50, -1)).toBe(Number.POSITIVE_INFINITY);
    expect(dlEbitdaSec(-50, -1)).toBe(0);
    expect(dlEbitdaSec(-50, 100)).toBe(-0.5);
  });

  it('receita ≤ 0 = sem dado; margem com receita ≤ lucro segue params (sem_dado | valor)', () => {
    const f = fy({ receita: 50, lucroAtribuivel: 80 });
    expect(valoresAnoStock(f).net_margin).toBeNull();
    expect(valoresAnoStock(f, { receitaMenorQueLucro: 'valor' }).net_margin).toBeCloseTo(160);
    expect(valoresAnoStock(fy({ receita: 0 })).revenue).toBeNull();
  });

  it('REIT: FCO ≤ 0 = +∞ no pagamento; dividendos ausentes = DPA × média diluída', () => {
    expect(
      dividendosFcoPctSec({ fco: -1, dividendosJcpPagos: 10, dpa: null, acoesMediaDiluida: 1 }),
    ).toBe(Number.POSITIVE_INFINITY);
    expect(
      dividendosFcoPctSec({ fco: 200, dividendosJcpPagos: null, dpa: 2, acoesMediaDiluida: 50 }),
    ).toBe(50);
    expect(dpaSec({ dpa: null, dividendosJcpPagos: 30, acoesMediaDiluida: 10 })).toBe(3);
  });
});
