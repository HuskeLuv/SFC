import { describe, it, expect } from 'vitest';
import { computeMwr, saldoBrutoAt } from '../mwrCalculator';

const day = (yyyy: number, mm: number, dd: number) =>
  new Date(Date.UTC(yyyy, mm - 1, dd)).getTime();

describe('computeMwr', () => {
  it('replicates Excel XIRR on a 3-flow textbook example', () => {
    // Aporte 10.000 em 2025-01-01, aporte adicional 5.000 em 2025-07-01,
    // valor terminal 17.000 em 2026-01-01. Capital médio empregado ≈ 12.500
    // por ano, ganho 2.000 ⇒ XIRR ≈ 16% a.a.
    const result = computeMwr({
      initialValue: 0,
      initialDate: day(2025, 1, 1),
      terminalValue: 17_000,
      terminalDate: day(2026, 1, 1),
      cashFlows: [
        { date: day(2025, 1, 1), amount: 10_000 },
        { date: day(2025, 7, 1), amount: 5_000 },
      ],
    });
    expect(result.converged).toBe(true);
    expect(result.mwrAnnualized).toBeCloseTo(0.16, 2);
  });

  it('lump-sum aporte: MWR anualizado = retorno simples anualizado', () => {
    // 10.000 aportados, 11.000 ao fim de 1 ano = 10% no período = 10% a.a.
    const result = computeMwr({
      initialValue: 0,
      initialDate: day(2025, 1, 1),
      terminalValue: 11_000,
      terminalDate: day(2026, 1, 1),
      cashFlows: [{ date: day(2025, 1, 1), amount: 10_000 }],
    });
    expect(result.converged).toBe(true);
    expect(result.mwrAnnualized).toBeCloseTo(0.1, 4);
    expect(result.mwrPeriod).toBeCloseTo(0.1, 4);
  });

  it('DCA mensal por 12 meses: MWR captura o timing do dinheiro', () => {
    // 12 aportes mensais de 1.000, valor terminal 13.500.
    // Ao contrário do TWR (que daria a média das valorizações), o MWR pondera
    // por quanto tempo cada real ficou na carteira — aporte de janeiro pesa mais.
    const flows = Array.from({ length: 12 }).map((_, i) => ({
      date: day(2025, i + 1, 1),
      amount: 1_000,
    }));
    const result = computeMwr({
      initialValue: 0,
      initialDate: day(2025, 1, 1),
      terminalValue: 13_500,
      terminalDate: day(2026, 1, 1),
      cashFlows: flows,
    });
    expect(result.converged).toBe(true);
    // MWR > 22% pq aportes recentes ficaram pouco tempo expostos ao retorno.
    expect(result.mwrAnnualized).toBeGreaterThan(0.2);
    expect(result.mwrAnnualized).toBeLessThan(0.3);
  });

  it('perda: MWR negativo para terminal < aplicado', () => {
    const result = computeMwr({
      initialValue: 0,
      initialDate: day(2025, 1, 1),
      terminalValue: 8_000,
      terminalDate: day(2026, 1, 1),
      cashFlows: [{ date: day(2025, 1, 1), amount: 10_000 }],
    });
    expect(result.converged).toBe(true);
    expect(result.mwrAnnualized).toBeCloseTo(-0.2, 3);
  });

  it('janela com initialValue não-zero (continuação de série)', () => {
    // Carteira já valia 5.000 em 2025-01-01; cliente aportou 1.000 em julho;
    // terminal 7.500 em 2026-01-01.
    const result = computeMwr({
      initialValue: 5_000,
      initialDate: day(2025, 1, 1),
      terminalValue: 7_500,
      terminalDate: day(2026, 1, 1),
      cashFlows: [{ date: day(2025, 7, 1), amount: 1_000 }],
    });
    expect(result.converged).toBe(true);
    expect(result.mwrAnnualized).toBeGreaterThan(0.2);
    expect(result.mwrAnnualized).toBeLessThan(0.3);
  });

  it('sem fluxo positivo (carteira sem valor terminal): retorna não-convergido', () => {
    const result = computeMwr({
      initialValue: 0,
      initialDate: day(2025, 1, 1),
      terminalValue: 0,
      terminalDate: day(2026, 1, 1),
      cashFlows: [{ date: day(2025, 1, 1), amount: 1_000 }],
    });
    expect(result.converged).toBe(false);
    expect(result.mwrAnnualized).toBe(0);
  });

  it('janela degenerada (terminalDate <= initialDate): retorna zero', () => {
    const result = computeMwr({
      initialValue: 1_000,
      initialDate: day(2025, 1, 1),
      terminalValue: 1_100,
      terminalDate: day(2025, 1, 1),
      cashFlows: [],
    });
    expect(result.yearsInWindow).toBe(0);
    expect(result.mwrAnnualized).toBe(0);
  });

  it('fluxos fora da janela são ignorados', () => {
    const result = computeMwr({
      initialValue: 0,
      initialDate: day(2025, 1, 1),
      terminalValue: 11_000,
      terminalDate: day(2026, 1, 1),
      cashFlows: [
        { date: day(2025, 1, 1), amount: 10_000 },
        { date: day(2024, 6, 1), amount: 99_999 }, // antes da janela — ignorado
        { date: day(2026, 6, 1), amount: 99_999 }, // depois — ignorado
      ],
    });
    expect(result.converged).toBe(true);
    expect(result.mwrAnnualized).toBeCloseTo(0.1, 4);
  });
});

describe('saldoBrutoAt', () => {
  const serie = [
    { data: day(2024, 1, 1), saldoBruto: 100 },
    { data: day(2024, 6, 1), saldoBruto: 150 },
    { data: day(2024, 12, 1), saldoBruto: 200 },
  ];

  it('retorna null se ref antes do primeiro ponto', () => {
    expect(saldoBrutoAt(serie, day(2023, 12, 31))).toBeNull();
  });

  it('retorna último valor se ref após série', () => {
    expect(saldoBrutoAt(serie, day(2025, 1, 1))).toBe(200);
  });

  it('retorna o último ponto <= ref', () => {
    expect(saldoBrutoAt(serie, day(2024, 6, 15))).toBe(150);
    expect(saldoBrutoAt(serie, day(2024, 1, 1))).toBe(100);
    expect(saldoBrutoAt(serie, day(2024, 12, 1))).toBe(200);
  });

  it('série vazia retorna null', () => {
    expect(saldoBrutoAt([], day(2024, 1, 1))).toBeNull();
  });
});
