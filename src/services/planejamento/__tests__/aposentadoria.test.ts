import { describe, it, expect } from 'vitest';
import {
  getRealAA,
  getRealM,
  getRetiroNom,
  getRetiroRealM,
  nomM,
  infM,
  conservadora80,
  calc,
  planTraj,
  revisedTraj,
  off2date,
  prevPat,
  calcRent,
  maxEOff,
  entryByOff,
  type AposentadoriaPlanoInput,
  type AposentadoriaEntry,
} from '../aposentadoria';

// Plano-base espelhando os defaults do protótipo.
function basePlan(over: Partial<AposentadoriaPlanoInput> = {}): AposentadoriaPlanoInput {
  return {
    idade: 30,
    apos: 65,
    vida: 90,
    rentNom: 12,
    inflacao: 5,
    rentNomRetiro: null,
    patrimonio: 10000,
    aporteM: 1000,
    renda: 5000,
    trackStartMonth: 6,
    trackStartYear: 2025,
    eventos: [],
    ...over,
  };
}

describe('taxas', () => {
  it('real a.a. via Fisher: (1.12/1.05)-1 ≈ 6,667%', () => {
    expect(getRealAA(basePlan())).toBeCloseTo(0.0666667, 5);
  });

  it('real mensal composta bate com a anual', () => {
    const s = basePlan();
    expect(Math.pow(1 + getRealM(s), 12) - 1).toBeCloseTo(getRealAA(s), 9);
  });

  it('taxa de aposentadoria cai pra acumulação quando null', () => {
    expect(getRetiroNom(basePlan())).toBe(12);
    expect(getRetiroNom(basePlan({ rentNomRetiro: 8 }))).toBe(8);
  });

  it('taxa real de aposentadoria usa rentNomRetiro quando definida', () => {
    const s = basePlan({ rentNomRetiro: 8 });
    expect(getRetiroRealM(s)).toBeCloseTo(Math.pow((1 + 0.08) / (1 + 0.05), 1 / 12) - 1, 9);
  });

  it('nomM e infM compõem de volta pra anual', () => {
    const s = basePlan();
    expect(Math.pow(1 + nomM(s), 12) - 1).toBeCloseTo(0.12, 9);
    expect(Math.pow(1 + infM(s), 12) - 1).toBeCloseTo(0.05, 9);
  });

  it('conservadora80 = 80% da taxa real re-expressa em nominal, arredondado a 0,5', () => {
    const v = conservadora80(basePlan());
    expect(v % 0.5).toBeCloseTo(0, 9);
    // 80% de 6,667% real ≈ 5,333% → nominal ≈ 10,6% → arredonda pra 10,5
    expect(v).toBeCloseTo(10.5, 1);
  });
});

describe('calc — projeção em termos reais', () => {
  it('retorna null quando vida <= apos', () => {
    expect(calc(basePlan({ vida: 65 }))).toBeNull();
    expect(calc(basePlan({ vida: 60 }))).toBeNull();
  });

  it('acumula patrimônio até a aposentadoria (Pr > 0) e marca isNow=false', () => {
    const d = calc(basePlan())!;
    expect(d).not.toBeNull();
    expect(d.isNow).toBe(false);
    expect(d.Pr).toBeGreaterThan(0);
    // accAges começa na idade atual e termina na aposentadoria
    expect(d.accAges[0]).toBe(30);
    expect(d.accAges.at(-1)).toBeCloseTo(65, 5);
  });

  it('saque preservando = Pr * taxa real mensal de aposentadoria', () => {
    const s = basePlan();
    const d = calc(s)!;
    expect(d.sacPres).toBeCloseTo(d.Pr * getRetiroRealM(s), 4);
  });

  it('consumir saca mais que preservar (rMR > 0)', () => {
    const d = calc(basePlan())!;
    expect(d.sacCons).toBeGreaterThan(d.sacPres);
  });

  it('renda desejada abaixo do saque-preservando nunca esgota o patrimônio', () => {
    const d = calc(basePlan({ renda: 100 }))!;
    expect(d.idadeAcaba).toBe(Infinity);
  });

  it('renda desejada muito alta esgota o patrimônio antes da expectativa de vida', () => {
    const d = calc(basePlan({ renda: 500000 }))!;
    expect(Number.isFinite(d.idadeAcaba)).toBe(true);
    expect(d.idadeAcaba).toBeGreaterThan(65);
  });

  it('já aposentado (apos <= idade): isNow=true e accAges começa na aposentadoria', () => {
    const d = calc(basePlan({ idade: 70, apos: 65, vida: 90 }))!;
    expect(d.isNow).toBe(true);
    expect(d.accAges[0]).toBe(65);
    // Sem fase de acumulação, Pr = patrimônio inicial.
    expect(d.Pr).toBeCloseTo(10000, 2);
  });

  it('evento de aporte pontual aumenta o patrimônio acumulado', () => {
    const semEvento = calc(basePlan())!;
    const comEvento = calc(basePlan({ eventos: [{ tipo: 'aporte', idade: 40, valor: 100000 }] }))!;
    expect(comEvento.Pr).toBeGreaterThan(semEvento.Pr);
  });
});

describe('planTraj — trajetória nominal', () => {
  it('T[0] = patrimônio inicial e C[0] = 0', () => {
    const { T, C } = planTraj(basePlan());
    expect(T[0]).toBe(10000);
    expect(C[0]).toBe(0);
  });

  it('retM = (apos - idade) * 12', () => {
    expect(planTraj(basePlan()).retM).toBe(35 * 12);
  });

  it('patrimônio nominal cresce monotonicamente sem resgates', () => {
    const { T, retM } = planTraj(basePlan());
    for (let i = 1; i <= retM; i++) {
      expect(T[i]).toBeGreaterThan(T[i - 1]);
    }
  });

  it('aporte nominal cresce com a inflação', () => {
    const { C } = planTraj(basePlan());
    // C[1] = aporteM * (1+infM)^0 = 1000; C[13] ≈ 1000 * (1+infM)^12 = 1050
    expect(C[1]).toBeCloseTo(1000, 2);
    expect(C[13]).toBeCloseTo(1000 * 1.05, 0);
  });
});

describe('revisedTraj', () => {
  it('começa no patrimônio atual informado', () => {
    const r = revisedTraj(basePlan(), 50000, 12);
    expect(r[0]).toBe(50000);
  });

  it('patrimônio atual maior que o plano projeta acima do plano original no fim', () => {
    const s = basePlan();
    const { T, retM } = planTraj(s);
    const off = 24;
    const acima = T[off] * 1.5;
    const rev = revisedTraj(s, acima, off);
    const revRet = rev[Math.max(0, retM - off)];
    expect(revRet).toBeGreaterThan(T[retM]);
  });
});

describe('helpers de datas / entries', () => {
  const s = basePlan(); // início Jun/2025

  it('off2date soma offsets corretamente, virando o ano', () => {
    expect(off2date(s, 0)).toEqual({ year: 2025, month: 6 });
    expect(off2date(s, 7)).toEqual({ year: 2026, month: 1 });
    expect(off2date(s, 12)).toEqual({ year: 2026, month: 6 });
  });

  it('entryByOff acha pelo offset', () => {
    const entries: AposentadoriaEntry[] = [
      { off: 1, year: 2025, month: 7, aporteReal: 1000, patFinal: 11200 },
    ];
    expect(entryByOff(entries, 1)?.patFinal).toBe(11200);
    expect(entryByOff(entries, 2)).toBeNull();
  });

  it('prevPat: offset 1 usa patrimônio inicial; demais usam entry anterior', () => {
    const entries: AposentadoriaEntry[] = [
      { off: 1, year: 2025, month: 7, aporteReal: 1000, patFinal: 11200 },
    ];
    expect(prevPat(s, [], 1)).toBe(10000);
    expect(prevPat(s, entries, 2)).toBe(11200);
    expect(prevPat(s, entries, 3)).toBeNull(); // sem entry no offset 2
  });

  it('calcRent: ((pat - aporte)/prev - 1)*100', () => {
    // prev 10000, aporte 1000, pat 11200 → ((11200-1000)/10000 -1)*100 = 2%
    expect(calcRent(10000, 1000, 11200)).toBeCloseTo(2, 6);
    expect(calcRent(null, 1000, 11200)).toBeNull();
    expect(calcRent(0, 1000, 11200)).toBeNull();
  });

  it('maxEOff: maior offset (0 se vazio)', () => {
    expect(maxEOff([])).toBe(0);
    expect(
      maxEOff([
        { off: 1, year: 2025, month: 7, aporteReal: 0, patFinal: 1 },
        { off: 5, year: 2025, month: 11, aporteReal: 0, patFinal: 1 },
      ]),
    ).toBe(5);
  });
});
