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
