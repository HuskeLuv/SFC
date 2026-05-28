import { describe, it, expect } from 'vitest';
import {
  pmt,
  planned,
  progress,
  categoryFromMonths,
  autoStatusOnEntry,
  deriveStatusAfterEntryDelete,
  addMonths,
} from '../planejamentoSonhos';

describe('categoryFromMonths', () => {
  it('≤12 meses → curto', () => {
    expect(categoryFromMonths(1)).toBe('c');
    expect(categoryFromMonths(12)).toBe('c');
  });
  it('13–60 meses → médio', () => {
    expect(categoryFromMonths(13)).toBe('m');
    expect(categoryFromMonths(60)).toBe('m');
  });
  it('>60 meses → longo', () => {
    expect(categoryFromMonths(61)).toBe('l');
    expect(categoryFromMonths(360)).toBe('l');
  });
});

describe('pmt — aporte mensal necessário', () => {
  it('rate=0: diferença dividida pelos meses', () => {
    // 25k - 5k = 20k em 12 meses sem juros = 1666,67/mês
    expect(pmt({ target: 25000, available: 5000, months: 12, rate: 0 })).toBeCloseTo(20000 / 12, 2);
  });

  it('rate=1%/mês: usa fórmula de anuidade', () => {
    // R$25k de target, R$5k disponível, 12 meses, 1%/mês
    // FV restante = 25000 - 5000*1.01^12 ≈ 19365.86
    // c = FV * 0.01 / (1.01^12 - 1) ≈ 1526.98
    const c = pmt({ target: 25000, available: 5000, months: 12, rate: 0.01 });
    expect(c).toBeCloseTo(1526.98, 1);
    // Sanity check: planejar 12 meses com esse aporte chega em ~target
    expect(planned({ target: 25000, available: 5000, months: 12, rate: 0.01 }, 12)).toBeCloseTo(
      25000,
      0,
    );
  });

  it('saldo inicial já cobre a meta → 0', () => {
    expect(pmt({ target: 1000, available: 1000, months: 12, rate: 0.01 })).toBe(0);
    expect(pmt({ target: 1000, available: 5000, months: 12, rate: 0.01 })).toBe(0);
  });

  it('months=0 → 0 (sem prazo, sem aporte)', () => {
    expect(pmt({ target: 25000, available: 5000, months: 0, rate: 0.01 })).toBe(0);
  });

  it('rate negativa pequena ainda funciona (treated as zero)', () => {
    expect(pmt({ target: 12000, available: 0, months: 12, rate: -1e-15 })).toBeCloseTo(1000, 6);
  });
});

describe('planned — saldo projetado', () => {
  it('t=0 retorna available', () => {
    expect(planned({ target: 25000, available: 5000, months: 12, rate: 0.01 }, 0)).toBe(5000);
  });

  it('t=months chega aproximadamente em target (com aporte regular = pmt)', () => {
    const g = { target: 25000, available: 5000, months: 12, rate: 0.01 };
    expect(planned(g, 12)).toBeCloseTo(25000, 0);
  });

  it('rate=0 cresce linearmente: available + pmt * t', () => {
    const g = { target: 12000, available: 0, months: 12, rate: 0 };
    // pmt = 1000/mês
    expect(planned(g, 6)).toBeCloseTo(6000, 2);
  });

  it('t negativo cai pra available (não projeta retroativamente)', () => {
    expect(planned({ target: 25000, available: 5000, months: 12, rate: 0.01 }, -3)).toBe(5000);
  });
});

describe('progress — progresso atual', () => {
  it('sem entries usa available como saldo', () => {
    const r = progress({ target: 25000, available: 5000, months: 12, rate: 0.01 });
    expect(r.balance).toBe(5000);
    expect(r.pct).toBe(20);
    expect(r.count).toBe(0);
  });

  it('com entries usa último balance (cronologicamente)', () => {
    const r = progress({
      target: 25000,
      available: 5000,
      months: 12,
      rate: 0.01,
      entries: [
        { month: '2026-01', aporte: 1500, balance: 6500 },
        { month: '2026-03', aporte: 3000, balance: 11500 }, // último cronológico
        { month: '2026-02', aporte: 1500, balance: 8000 },
      ],
    });
    expect(r.balance).toBe(11500);
    expect(r.pct).toBe(46);
    expect(r.count).toBe(3);
  });

  it('pct é cap em 100', () => {
    const r = progress({
      target: 1000,
      available: 0,
      months: 12,
      rate: 0,
      entries: [{ month: '2026-01', aporte: 5000, balance: 5000 }],
    });
    expect(r.pct).toBe(100);
  });

  it('target=0 retorna pct=0 sem dividir por zero', () => {
    expect(progress({ target: 0, available: 100, months: 12, rate: 0 }).pct).toBe(0);
  });
});

describe('autoStatusOnEntry — transições automáticas', () => {
  it('balance >= target → Concluído', () => {
    expect(autoStatusOnEntry('Iniciado', 25000, 25000)).toBe('Concluído');
    expect(autoStatusOnEntry('Em espera', 30000, 25000)).toBe('Concluído');
    expect(autoStatusOnEntry('Atrasado', 25000, 25000)).toBe('Concluído');
  });

  it('Em espera + balance < target → Iniciado', () => {
    expect(autoStatusOnEntry('Em espera', 5000, 25000)).toBe('Iniciado');
  });

  it('preserva status quando não houver razão pra mudar', () => {
    expect(autoStatusOnEntry('Iniciado', 5000, 25000)).toBe('Iniciado');
    expect(autoStatusOnEntry('Pausado', 5000, 25000)).toBe('Pausado');
    expect(autoStatusOnEntry('Atrasado', 5000, 25000)).toBe('Atrasado');
  });
});

describe('deriveStatusAfterEntryDelete — re-derivação pós-delete (F3.2 residual)', () => {
  it('sem entries restantes E status "Concluído" → "Em espera"', () => {
    expect(deriveStatusAfterEntryDelete('Concluído', [], 1000)).toBe('Em espera');
  });

  it('sem entries restantes preserva status não-Concluído', () => {
    expect(deriveStatusAfterEntryDelete('Iniciado', [], 1000)).toBe('Iniciado');
    expect(deriveStatusAfterEntryDelete('Em espera', [], 1000)).toBe('Em espera');
    expect(deriveStatusAfterEntryDelete('Pausado', [], 1000)).toBe('Pausado');
    expect(deriveStatusAfterEntryDelete('Atrasado', [], 1000)).toBe('Atrasado');
  });

  it('latest balance ≥ target mantém "Concluído"', () => {
    expect(
      deriveStatusAfterEntryDelete(
        'Concluído',
        [
          { month: '2026-01', balance: 500 },
          { month: '2026-02', balance: 1200 },
        ],
        1000,
      ),
    ).toBe('Concluído');
  });

  it('latest balance < target E status "Concluído" → "Iniciado" (demote)', () => {
    expect(
      deriveStatusAfterEntryDelete('Concluído', [{ month: '2026-01', balance: 500 }], 1000),
    ).toBe('Iniciado');
  });

  it('entries existem mas status atual não é "Concluído" → preserva', () => {
    expect(
      deriveStatusAfterEntryDelete('Pausado', [{ month: '2026-01', balance: 500 }], 1000),
    ).toBe('Pausado');
    expect(
      deriveStatusAfterEntryDelete('Atrasado', [{ month: '2026-01', balance: 500 }], 1000),
    ).toBe('Atrasado');
  });

  it('ordena entries pra escolher latest mesmo se chegarem fora de ordem', () => {
    expect(
      deriveStatusAfterEntryDelete(
        'Concluído',
        [
          { month: '2026-03', balance: 800 },
          { month: '2026-01', balance: 1200 },
          { month: '2026-02', balance: 600 },
        ],
        1000,
      ),
    ).toBe('Iniciado');
  });
});

describe('addMonths', () => {
  it('soma simples', () => {
    expect(addMonths('2026-01', 6)).toBe('2026-07');
  });
  it('atravessa o ano', () => {
    expect(addMonths('2026-10', 5)).toBe('2027-03');
  });
  it('múltiplos anos', () => {
    expect(addMonths('2026-06', 24)).toBe('2028-06');
  });
  it('n=0 mantém', () => {
    expect(addMonths('2026-06', 0)).toBe('2026-06');
  });
});
