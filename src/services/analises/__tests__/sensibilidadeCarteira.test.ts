import { describe, it, expect } from 'vitest';
import {
  alignSeries,
  annualizedVolatility,
  buildSensibilidadeCarteira,
  classifyCorrelation,
  computeBeta,
  covariance,
  extractMonthlyCloses,
  marginalRiskContribution,
  monthKey,
  monthlyReturnsFromCloses,
  pearsonCorrelation,
} from '../sensibilidadeCarteira';

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

describe('monthKey', () => {
  it('formats as YYYY-MM in UTC', () => {
    expect(monthKey(utc(2025, 3, 15))).toBe('2025-03');
    expect(monthKey(utc(2024, 12, 31))).toBe('2024-12');
  });
});

describe('extractMonthlyCloses', () => {
  it('picks the last trading day of each month', () => {
    const daily = [
      { date: utc(2025, 1, 2), value: 10 },
      { date: utc(2025, 1, 15), value: 11 },
      { date: utc(2025, 1, 31), value: 12 }, // último de jan
      { date: utc(2025, 2, 5), value: 13 },
      { date: utc(2025, 2, 28), value: 14 }, // último de fev
    ];
    const closes = extractMonthlyCloses(daily);
    expect(closes.get('2025-01')).toBe(12);
    expect(closes.get('2025-02')).toBe(14);
    expect(closes.size).toBe(2);
  });

  it('ignores non-positive and non-finite values', () => {
    const daily = [
      { date: utc(2025, 1, 10), value: 0 },
      { date: utc(2025, 1, 20), value: Number.NaN },
      { date: utc(2025, 1, 30), value: 50 },
    ];
    const closes = extractMonthlyCloses(daily);
    expect(closes.get('2025-01')).toBe(50);
  });
});

describe('monthlyReturnsFromCloses', () => {
  it('computes returns and skips the first month', () => {
    const closes = new Map([
      ['2025-01', 100],
      ['2025-02', 110],
      ['2025-03', 99],
    ]);
    const r = monthlyReturnsFromCloses(closes);
    expect(r.has('2025-01')).toBe(false);
    expect(r.get('2025-02')).toBeCloseTo(0.1, 10);
    expect(r.get('2025-03')).toBeCloseTo(99 / 110 - 1, 10);
  });
});

describe('alignSeries', () => {
  it('intersects keys and preserves chronological order', () => {
    const a = new Map([
      ['2025-01', 1],
      ['2025-03', 3],
      ['2025-02', 2],
    ]);
    const b = new Map([
      ['2025-02', 20],
      ['2025-03', 30],
      ['2025-04', 40],
    ]);
    const { keys, a: av, b: bv } = alignSeries(a, b);
    expect(keys).toEqual(['2025-02', '2025-03']);
    expect(av).toEqual([2, 3]);
    expect(bv).toEqual([20, 30]);
  });
});

describe('covariance', () => {
  it('returns 0 when lengths mismatch or n<2', () => {
    expect(covariance([1], [1])).toBe(0);
    expect(covariance([], [])).toBe(0);
    expect(covariance([1, 2], [1])).toBe(0);
  });
});

describe('pearsonCorrelation', () => {
  it('≈ 1 for perfectly positively correlated series', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const y = x.map((v) => 2 * v + 5);
    expect(pearsonCorrelation(x, y)).toBeCloseTo(1, 10);
  });

  it('≈ -1 for perfectly anti-correlated series', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const y = x.map((v) => -3 * v + 100);
    expect(pearsonCorrelation(x, y)).toBeCloseTo(-1, 10);
  });

  it('returns 0 (not NaN) when one series has zero variance', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [7, 7, 7, 7, 7];
    const c = pearsonCorrelation(x, y);
    expect(Number.isNaN(c)).toBe(false);
    expect(c).toBe(0);
  });

  it('returns 0 when fewer than 2 points', () => {
    expect(pearsonCorrelation([1], [1])).toBe(0);
    expect(pearsonCorrelation([], [])).toBe(0);
  });
});

describe('marginalRiskContribution', () => {
  it('reflects weight: doubling weight doubles MRC', () => {
    const asset = [0.01, 0.02, -0.01, 0.03, 0.0, 0.015];
    const port = [0.005, 0.015, -0.005, 0.02, 0.002, 0.01];
    const mrc1 = marginalRiskContribution(0.1, asset, port);
    const mrc2 = marginalRiskContribution(0.2, asset, port);
    expect(mrc2).toBeCloseTo(mrc1 * 2, 10);
  });

  it('returns 0 when portfolio variance is 0', () => {
    const asset = [0.01, 0.02, -0.01];
    const port = [0.01, 0.01, 0.01];
    expect(marginalRiskContribution(0.5, asset, port)).toBe(0);
  });
});

describe('classifyCorrelation', () => {
  it('buckets correctly around thresholds', () => {
    expect(classifyCorrelation(0.9)).toBe('alta');
    expect(classifyCorrelation(0.7)).toBe('media'); // > 0.7 p/ alta, então 0.7 é média
    expect(classifyCorrelation(0.5)).toBe('media');
    expect(classifyCorrelation(0.0)).toBe('baixa');
    expect(classifyCorrelation(-0.3)).toBe('baixa');
    expect(classifyCorrelation(-0.5)).toBe('negativa');
  });
});

describe('computeBeta', () => {
  // Sequência explícita de 14 meses (Jan/2024..Fev/2025) → 13 retornos (> MIN = 12).
  const months14: Array<[number, number]> = [
    [2024, 1],
    [2024, 2],
    [2024, 3],
    [2024, 4],
    [2024, 5],
    [2024, 6],
    [2024, 7],
    [2024, 8],
    [2024, 9],
    [2024, 10],
    [2024, 11],
    [2024, 12],
    [2025, 1],
    [2025, 2],
  ];
  const daily = (closes: number[]) =>
    months14.map(([y, m], i) => ({ date: utc(y, m, 28), value: closes[i] }));

  it('β = 1 quando o ativo replica o mercado', () => {
    const market = [100, 101, 103, 102, 104, 105, 103, 104, 107, 107, 109, 108, 110, 111];
    const beta = computeBeta(daily(market), daily(market));
    expect(beta).not.toBeNull();
    expect(beta!).toBeCloseTo(1, 6);
  });

  it('β = 2 quando o ativo amplifica o mercado 2×', () => {
    const market = [100, 101, 103, 102, 104, 105, 103, 104, 107, 107, 109, 108, 110, 111];
    // retornos do ativo = 2 × retornos do mercado
    const asset: number[] = [100];
    for (let i = 1; i < market.length; i++) {
      const r = market[i] / market[i - 1] - 1;
      asset.push(asset[i - 1] * (1 + 2 * r));
    }
    const beta = computeBeta(daily(asset), daily(market));
    expect(beta).not.toBeNull();
    expect(beta!).toBeCloseTo(2, 4);
  });

  it('retorna null quando há menos de 12 meses em comum', () => {
    const short: Array<{ date: number; value: number }> = [
      { date: utc(2025, 1, 28), value: 100 },
      { date: utc(2025, 2, 28), value: 101 },
    ];
    const market = [100, 101, 103, 102, 104, 105, 103, 104, 107, 107, 109, 108, 110, 111];
    expect(computeBeta(short, daily(market))).toBeNull();
  });

  it('retorna null quando variância do mercado é zero', () => {
    const flat = Array(14).fill(100);
    const asset = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113];
    expect(computeBeta(daily(asset), daily(flat))).toBeNull();
  });
});

describe('annualizedVolatility', () => {
  it('returns stddev × √12 × 100', () => {
    const returns = [0.01, -0.02, 0.03, -0.01, 0.02, 0.0];
    const v = annualizedVolatility(returns);
    expect(v).toBeGreaterThan(0);
    // Sanity check: para essa série, stddev ≈ 0.0185, anualizada ≈ 6.4%
    expect(v).toBeCloseTo(6.4, 0);
  });
});

describe('buildSensibilidadeCarteira', () => {
  const buildDaily = (monthlyCloses: Array<[string, number]>) =>
    monthlyCloses.map(([ym, v]) => {
      const [y, m] = ym.split('-').map(Number);
      return { date: utc(y, m, 28), value: v };
    });

  const portfolioReturns = new Map<string, number>([
    ['2024-02', 0.01],
    ['2024-03', 0.02],
    ['2024-04', -0.01],
    ['2024-05', 0.015],
    ['2024-06', 0.005],
    ['2024-07', -0.02],
    ['2024-08', 0.01],
    ['2024-09', 0.025],
    ['2024-10', 0.0],
    ['2024-11', 0.018],
    ['2024-12', -0.005],
    ['2025-01', 0.012],
    ['2025-02', 0.008],
  ]);

  it('inclui ativos com ≥ 12 meses; exclui os com menos', () => {
    const closesLong: Array<[string, number]> = [
      ['2024-01', 100],
      ['2024-02', 101],
      ['2024-03', 103],
      ['2024-04', 102],
      ['2024-05', 104],
      ['2024-06', 105],
      ['2024-07', 103],
      ['2024-08', 104],
      ['2024-09', 107],
      ['2024-10', 107],
      ['2024-11', 109],
      ['2024-12', 108],
      ['2025-01', 110],
      ['2025-02', 111],
    ];
    const closesShort: Array<[string, number]> = [
      ['2024-12', 50],
      ['2025-01', 52],
      ['2025-02', 53],
    ];

    const resp = buildSensibilidadeCarteira({
      portfolioMonthlyReturns: portfolioReturns,
      windowMonths: 24,
      calculadoEm: new Date('2025-02-28T00:00:00Z'),
      assets: [
        {
          ticker: 'LONG',
          nome: 'Long Asset',
          rawWeight: 6000,
          dailyPrices: buildDaily(closesLong),
        },
        {
          ticker: 'SHRT',
          nome: 'Short Hist',
          rawWeight: 4000,
          dailyPrices: buildDaily(closesShort),
        },
      ],
    });

    expect(resp.ativos.map((a) => a.ticker)).toEqual(['LONG']);
    expect(resp.excluidos).toHaveLength(1);
    expect(resp.excluidos[0].ticker).toBe('SHRT');
    expect(resp.excluidos[0].motivo).toBe('insuficiente-historico');
  });

  it('renormaliza pesos para somar 1 sobre os incluídos', () => {
    const longCloses: Array<[string, number]> = [
      ['2024-01', 100],
      ['2024-02', 101],
      ['2024-03', 103],
      ['2024-04', 102],
      ['2024-05', 104],
      ['2024-06', 105],
      ['2024-07', 103],
      ['2024-08', 104],
      ['2024-09', 107],
      ['2024-10', 107],
      ['2024-11', 109],
      ['2024-12', 108],
      ['2025-01', 110],
      ['2025-02', 111],
    ];

    const resp = buildSensibilidadeCarteira({
      portfolioMonthlyReturns: portfolioReturns,
      windowMonths: 24,
      assets: [
        { ticker: 'A', nome: 'A', rawWeight: 3000, dailyPrices: buildDaily(longCloses) },
        { ticker: 'B', nome: 'B', rawWeight: 1000, dailyPrices: buildDaily(longCloses) },
      ],
    });

    const pesos = resp.ativos.map((a) => a.peso);
    expect(pesos.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 10);
    // A tem 3x o peso bruto de B
    const pesoA = resp.ativos.find((a) => a.ticker === 'A')!.peso;
    const pesoB = resp.ativos.find((a) => a.ticker === 'B')!.peso;
    expect(pesoA / pesoB).toBeCloseTo(3, 10);
  });

  it('ordena os ativos por contribuição ao risco desc', () => {
    const basePrices: Array<[string, number]> = [
      ['2024-01', 100],
      ['2024-02', 101],
      ['2024-03', 103.02],
      ['2024-04', 101.99],
      ['2024-05', 103.52],
      ['2024-06', 104.04],
      ['2024-07', 101.96],
      ['2024-08', 102.98],
      ['2024-09', 105.56],
      ['2024-10', 105.56],
      ['2024-11', 107.46],
      ['2024-12', 106.92],
      ['2025-01', 108.2],
      ['2025-02', 109.07],
    ];

    const resp = buildSensibilidadeCarteira({
      portfolioMonthlyReturns: portfolioReturns,
      windowMonths: 24,
      assets: [
        { ticker: 'BIG', nome: 'Big', rawWeight: 9000, dailyPrices: buildDaily(basePrices) },
        { ticker: 'SML', nome: 'Small', rawWeight: 1000, dailyPrices: buildDaily(basePrices) },
      ],
    });

    expect(resp.ativos[0].contribuicaoRisco).toBeGreaterThan(resp.ativos[1].contribuicaoRisco);
    expect(resp.ativos[0].ticker).toBe('BIG');
  });

  it('classifica bucket com base na correlacao', () => {
    // série que replica exatamente os retornos da carteira → correl = 1
    const portfolioCloses = new Map<string, number>();
    let price = 100;
    portfolioCloses.set('2024-01', price);
    for (const [ym, r] of portfolioReturns) {
      price = price * (1 + r);
      portfolioCloses.set(ym, price);
    }
    const dailyFromCloses = Array.from(portfolioCloses.entries()).map(([ym, v]) => {
      const [y, m] = ym.split('-').map(Number);
      return { date: utc(y, m, 28), value: v };
    });

    const resp = buildSensibilidadeCarteira({
      portfolioMonthlyReturns: portfolioReturns,
      windowMonths: 24,
      assets: [{ ticker: 'MIR', nome: 'Mirror', rawWeight: 1000, dailyPrices: dailyFromCloses }],
    });

    expect(resp.ativos[0].correlacao).toBeCloseTo(1, 6);
    expect(resp.ativos[0].bucket).toBe('alta');
  });

  it('devolve volatilidade anualizada positiva da carteira', () => {
    const resp = buildSensibilidadeCarteira({
      portfolioMonthlyReturns: portfolioReturns,
      windowMonths: 24,
      assets: [],
    });
    expect(resp.carteira.volatilidadeAnual).toBeGreaterThan(0);
    expect(resp.mesesUtilizados).toBe(portfolioReturns.size);
  });
});
