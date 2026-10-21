/**
 * seriesStock.ts — acréscimos da F0 do fundamentei-regras: série 'ebit' pelo degrau (fora das
 * saídas de hoje), remuneracaoAcoes (SBC) lida por lerBrutosSec e as funções puras do REIT com o
 * caixa operacional ajustado (SBC nula → nulo; FCO ajustado ≤ 0 = +∞). Valores sintéticos, salvo a
 * regressão contra a fixture da SEC (eua-dev.json, fonte primária).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  SERIES_REIT_AJUSTADAS,
  SERIES_STOCK,
  SERIES_STOCK_COM_EBIT,
  degrauEbitSec,
  dividendosFcoAjustadoPctSec,
  ebitSec,
  fcoAjustadoPorAcaoSec,
  fcoAjustadoSec,
  lerBrutosSec,
  sbcSec,
  seriesStock,
  valoresAjustadosReitSec,
  valoresAnoStock,
  valoresAnoStockComEbit,
  type BrutoSec,
  type FySec,
} from '@/services/analiseAtivos/regras/criterios/seriesStock';
import { dividendosPagosSec } from '@/services/analiseAtivos/regras/criterios/seriesReit';
import fixture from './fixtures/eua-dev.json';

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

const EMPRESAS = fixture.empresas as unknown as Array<{
  symbol: string;
  cik: string;
  fys: FySec[];
}>;

describe("série 'ebit' pelo degrau", () => {
  it('ebit = base do EBITDA sem a D&A; D&A ausente não tira o EBIT', () => {
    const f = fy({ ebit: 1_500_000_000, depreciacaoAmortizacao: null });
    expect(ebitSec(f)).toBe(1_500_000_000);
    expect(valoresAnoStockComEbit(f).ebit).toBe(1500);
    expect(valoresAnoStockComEbit(f).ebitda).toBeNull();
    expect(ebitSec(fy({ ebit: null }))).toBeNull();
    expect(ebitSec(fy({ ebit: Number.NaN }))).toBeNull();
  });

  it('degrau pelas flags da ingestão', () => {
    expect(degrauEbitSec(fy({}))).toBe('lucro_operacional');
    expect(degrauEbitSec(fy({ flags: ['ebitda_pre_ir'] }))).toBe('pre_ir');
    expect(degrauEbitSec(fy({ flags: ['ebitda_lucro'] }))).toBe('lucro');
  });

  it('as saídas de hoje não mudam: sem a opção, nenhuma série ebit', () => {
    expect(SERIES_STOCK).not.toContain('ebit');
    expect(SERIES_STOCK_COM_EBIT).toEqual([...SERIES_STOCK, 'ebit']);
    const f = fy({ receita: 1e9, ebit: 2e8, depreciacaoAmortizacao: 5e7 });
    expect(Object.keys(valoresAnoStock(f))).toEqual([...SERIES_STOCK]);
    for (const e of EMPRESAS) {
      const b: BrutoSec = { cik: e.cik, fys: e.fys };
      const hoje = seriesStock(b);
      expect(Object.keys(hoje).sort()).toEqual([...SERIES_STOCK].sort());
      const comEbit = seriesStock(b, { incluirEbit: true });
      const { ebit, ...resto } = comEbit;
      expect(resto).toEqual(hoje);
      for (const [ano, v] of Object.entries(ebit ?? {})) {
        const fys = e.fys.filter((x) => x.anoFiscal === Number(ano));
        expect(fys.length).toBeGreaterThan(0);
        if (v !== null) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('com a opção, ebit em US$ mi por ano', () => {
    const b: BrutoSec = {
      cik: '0000000001',
      fys: [
        fy({ anoFiscal: 2024, dtFim: '2024-12-31', ebit: 1e9 }),
        fy({ anoFiscal: 2025, dtFim: '2025-12-31', ebit: -2e8 }),
      ],
    };
    expect(seriesStock(b, { incluirEbit: true }).ebit).toEqual({ 2024: 1000, 2025: -200 });
  });
});

describe('REIT: caixa operacional ajustado pela SBC', () => {
  const base = { fco: 1_000, remuneracaoAcoes: 100, acoesMediaDiluida: 50 };

  it('FCO ajustado = FCO − SBC; por ação = ÷ média diluída', () => {
    expect(fcoAjustadoSec(base)).toBe(900);
    expect(fcoAjustadoPorAcaoSec(base)).toBe(18);
    expect(fcoAjustadoSec({ ...base, remuneracaoAcoes: 0 })).toBe(1_000);
  });

  it('SBC nula, ausente ou negativa = nulo (nunca 0)', () => {
    expect(sbcSec({ remuneracaoAcoes: null })).toBeNull();
    expect(sbcSec({})).toBeNull();
    expect(sbcSec({ remuneracaoAcoes: -5 })).toBeNull();
    expect(fcoAjustadoSec({ fco: 1_000, remuneracaoAcoes: null })).toBeNull();
    expect(fcoAjustadoSec({ fco: 1_000 })).toBeNull();
    expect(fcoAjustadoPorAcaoSec({ ...base, remuneracaoAcoes: null })).toBeNull();
    expect(dividendosFcoAjustadoPctSec({ fco: 1_000, remuneracaoAcoes: null }, 450)).toBeNull();
  });

  it('FCO ou ações sem dado = nulo', () => {
    expect(fcoAjustadoSec({ ...base, fco: null })).toBeNull();
    expect(fcoAjustadoPorAcaoSec({ ...base, acoesMediaDiluida: 0 })).toBeNull();
    expect(fcoAjustadoPorAcaoSec({ ...base, acoesMediaDiluida: null })).toBeNull();
  });

  it('payout sobre o ajustado; FCO ajustado ≤ 0 = +∞; dividendos sem dado ou negativos = nulo', () => {
    expect(dividendosFcoAjustadoPctSec(base, 450)).toBe(50);
    expect(dividendosFcoAjustadoPctSec({ fco: 100, remuneracaoAcoes: 100 }, 10)).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(dividendosFcoAjustadoPctSec({ fco: -10, remuneracaoAcoes: 5 }, 10)).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(dividendosFcoAjustadoPctSec(base, null)).toBeNull();
    expect(dividendosFcoAjustadoPctSec(base, -1)).toBeNull();
  });

  it('valores ajustados de um FY com os dividendos de seriesReit', () => {
    const f = fy({ ...base, dividendosJcpPagos: 720 });
    expect(SERIES_REIT_AJUSTADAS).toEqual(['ocf_adjusted_per_share', 'cash_payout_adjusted_pct']);
    expect(valoresAjustadosReitSec(f, dividendosPagosSec(f))).toEqual({
      ocf_adjusted_per_share: 18,
      cash_payout_adjusted_pct: 80,
    });
    expect(valoresAjustadosReitSec({ ...f, remuneracaoAcoes: null }, 720)).toEqual({
      ocf_adjusted_per_share: null,
      cash_payout_adjusted_pct: null,
    });
  });
});

describe('lerBrutosSec lê remuneracaoAcoes', () => {
  it('pede a coluna no select e converte Decimal → number (nula fica nula)', async () => {
    const decimal = (n: number) => ({ toNumber: () => n });
    const linha = (dtFim: string, sbc: ReturnType<typeof decimal> | null) => ({
      emissorId: 'CIK:0000000001',
      dtFim: new Date(`${dtFim}T00:00:00.000Z`),
      versao: 1,
      anoFiscal: Number(dtFim.slice(0, 4)),
      receita: null,
      ebit: null,
      depreciacaoAmortizacao: null,
      lucroLiquido: null,
      lucroAtribuivel: null,
      caixa: null,
      aplicacoesFinanceiras: null,
      dividaBrutaCp: null,
      dividaBrutaLp: null,
      fco: decimal(1_000),
      capex: null,
      dividendosJcpPagos: null,
      recompras: null,
      pl: null,
      acoesMediaDiluida: decimal(50),
      dpa: null,
      dpaOrigem: null,
      flags: [],
      remuneracaoAcoes: sbc,
    });
    const findMany = vi
      .fn()
      .mockResolvedValue([linha('2024-12-31', decimal(100)), linha('2025-12-31', null)]);
    const prisma = { assetFundamentalsPeriod: { findMany } } as unknown as Parameters<
      typeof lerBrutosSec
    >[0];
    const out = await lerBrutosSec(prisma, ['0000000001'], 2020);
    expect(findMany.mock.calls[0][0].select.remuneracaoAcoes).toBe(true);
    const fys = out.get('0000000001')?.fys ?? [];
    expect(fys.map((f) => f.remuneracaoAcoes)).toEqual([100, null]);
    expect(fcoAjustadoPorAcaoSec(fys[0])).toBe(18);
    expect(fcoAjustadoPorAcaoSec(fys[1])).toBeNull();
  });
});
