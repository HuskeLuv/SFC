import { describe, it, expect } from 'vitest';
import { buildMwrSeries } from '../mwrSeriesBuilder';

const day = (yyyy: number, mm: number, dd: number) =>
  new Date(Date.UTC(yyyy, mm - 1, dd)).getTime();

describe('buildMwrSeries', () => {
  it('primeiro ponto sempre = 0%', () => {
    const series = buildMwrSeries({
      historicoPatrimonio: [
        { data: day(2025, 1, 1), valorAplicado: 1000, saldoBruto: 1000 },
        { data: day(2025, 7, 1), valorAplicado: 1000, saldoBruto: 1100 },
      ],
      cashFlowsByDay: new Map([[day(2025, 1, 1), 1000]]),
    });
    expect(series).toHaveLength(2);
    expect(series[0].value).toBe(0);
    expect(series[1].value).toBeGreaterThan(0);
  });

  it('lump-sum 10k → 11k em 1 ano: MWR ≈ 10%', () => {
    const series = buildMwrSeries({
      historicoPatrimonio: [
        { data: day(2025, 1, 1), valorAplicado: 10000, saldoBruto: 10000 },
        { data: day(2026, 1, 1), valorAplicado: 10000, saldoBruto: 11000 },
      ],
      cashFlowsByDay: new Map([[day(2025, 1, 1), 10000]]),
    });
    expect(series[1].value).toBeCloseTo(10, 1);
  });

  it('série vazia → retorna []', () => {
    expect(buildMwrSeries({ historicoPatrimonio: [] })).toEqual([]);
  });

  it('deriva fluxos de valorAplicado quando cashFlowsByDay não informado', () => {
    const series = buildMwrSeries({
      historicoPatrimonio: [
        { data: day(2025, 1, 1), valorAplicado: 10000, saldoBruto: 10000 },
        { data: day(2025, 7, 1), valorAplicado: 10000, saldoBruto: 10500 },
        { data: day(2026, 1, 1), valorAplicado: 10000, saldoBruto: 11000 },
      ],
      // sem cashFlowsByDay — deriva do delta valorAplicado
    });
    expect(series).toHaveLength(3);
    expect(series[0].value).toBe(0);
    expect(series[1].value).toBeCloseTo(5, 1);
    expect(series[2].value).toBeCloseTo(10, 1);
  });

  it('startMs filtra pontos anteriores e re-zera no início da janela', () => {
    const series = buildMwrSeries({
      historicoPatrimonio: [
        { data: day(2024, 1, 1), valorAplicado: 1000, saldoBruto: 1000 },
        { data: day(2025, 1, 1), valorAplicado: 1000, saldoBruto: 1100 },
        { data: day(2026, 1, 1), valorAplicado: 1000, saldoBruto: 1200 },
      ],
      cashFlowsByDay: new Map([[day(2024, 1, 1), 1000]]),
      startMs: day(2025, 1, 1),
    });
    expect(series).toHaveLength(2);
    expect(series[0].data).toBe(day(2025, 1, 1));
    expect(series[0].value).toBe(0);
    // De 1100 (start) pra 1200 (end), 1 ano, sem aporte → MWR ≈ 9.09%
    expect(series[1].value).toBeCloseTo(9.09, 1);
  });

  it('último ponto com salto em valorAplicado SEM saldoBruto proporcional: derivação cria fluxo fantasma e MWR despenca; cashFlowsByDay autoritativo evita queda (regressão drop no último dia)', () => {
    // Cenário do bug: último ponto é patched com totais ao vivo (incluindo a soma
    // de investimentos do cashflow planner), mas o ponto anterior vem do snapshot
    // (que só inclui o mês mais recente via replacement). valorAplicado pula 6k,
    // saldoBruto só sobe 3k (a parte cumulativa que faltava).
    const historicoPatrimonio = [
      { data: day(2025, 1, 1), valorAplicado: 100_000, saldoBruto: 100_000 },
      { data: day(2026, 1, 1), valorAplicado: 100_000, saldoBruto: 110_000 },
      { data: day(2026, 1, 2), valorAplicado: 106_000, saldoBruto: 113_000 },
    ];

    // Sem cashFlowsByDay: derivação infere +6k de aporte fantasma no último dia,
    // então o solver desconta esse fluxo do terminal → MWR despenca de ~10% pra ~7%.
    const buggy = buildMwrSeries({ historicoPatrimonio });
    expect(buggy[1].value).toBeCloseTo(10, 0);
    expect(buggy[2].value).toBeLessThan(buggy[1].value - 2);

    // Com cashFlowsByDay autoritativo (só o seed inicial, sem aporte fantasma no
    // último dia), MWR sobe levemente entre os dois últimos pontos — refletindo o
    // crescimento real do saldo bruto.
    const fixed = buildMwrSeries({
      historicoPatrimonio,
      cashFlowsByDay: new Map([[day(2025, 1, 1), 100_000]]),
    });
    expect(fixed[2].value).toBeGreaterThan(fixed[1].value);
    expect(fixed[2].value).toBeGreaterThan(buggy[2].value);
  });

  it('DCA: MWR cresce monotonicamente com retorno positivo', () => {
    const flows = new Map<number, number>();
    const historicoPatrimonio = [];
    let saldoBruto = 0;
    for (let i = 0; i < 12; i++) {
      const data = day(2025, i + 1, 1);
      flows.set(data, 1000);
      saldoBruto += 1000;
      saldoBruto *= 1.01; // ~1% ao mês de valorização após o aporte
      historicoPatrimonio.push({ data, valorAplicado: (i + 1) * 1000, saldoBruto });
    }
    const series = buildMwrSeries({ historicoPatrimonio, cashFlowsByDay: flows });
    expect(series).toHaveLength(12);
    expect(series[0].value).toBe(0);
    // Last value should be positive (> 5%)
    expect(series[series.length - 1].value).toBeGreaterThan(5);
  });
});
