import { describe, it, expect } from 'vitest';
import {
  parseIsoDateUtc,
  resolverPeriodoPersonalizado,
  cortarNoFim,
  rotuloPeriodo,
  indicesRangeParaInicio,
  toIsoDateUtc,
} from '../periodoPersonalizado';

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

describe('parseIsoDateUtc', () => {
  it('converte YYYY-MM-DD em meia-noite UTC', () => {
    expect(parseIsoDateUtc('2026-09-01')).toBe(utc(2026, 9, 1));
  });
  it('rejeita formato/dia inválido', () => {
    expect(parseIsoDateUtc('01/09/2026')).toBeNull();
    expect(parseIsoDateUtc('2026-02-30')).toBeNull();
    expect(parseIsoDateUtc('')).toBeNull();
  });
});

describe('resolverPeriodoPersonalizado', () => {
  const hoje = utc(2026, 9, 2);
  const primeiroInvestimento = utc(2020, 2, 5);

  it('aceita intervalo dentro da carteira', () => {
    const r = resolverPeriodoPersonalizado({
      inicioIso: '2024-01-01',
      fimIso: '2025-12-31',
      firstInvestmentDate: primeiroInvestimento,
      hojeUtc: hoje,
    });
    expect(r).toEqual({
      ok: true,
      periodo: { inicio: utc(2024, 1, 1), fim: utc(2025, 12, 31) },
      inicioClampado: false,
      fimClampado: false,
    });
  });

  it('sobe o início até o 1º investimento e desce o fim até hoje', () => {
    const r = resolverPeriodoPersonalizado({
      inicioIso: '2010-01-01',
      fimIso: '2030-01-01',
      firstInvestmentDate: primeiroInvestimento,
      hojeUtc: hoje,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.periodo).toEqual({ inicio: primeiroInvestimento, fim: hoje });
      expect(r.inicioClampado).toBe(true);
      expect(r.fimClampado).toBe(true);
    }
  });

  it('erro quando fim < início (inclusive após o clamp)', () => {
    expect(
      resolverPeriodoPersonalizado({
        inicioIso: '2025-05-10',
        fimIso: '2025-05-01',
        hojeUtc: hoje,
      }).ok,
    ).toBe(false);
    expect(
      resolverPeriodoPersonalizado({
        inicioIso: '2010-01-01',
        fimIso: '2019-01-01',
        firstInvestmentDate: primeiroInvestimento,
        hojeUtc: hoje,
      }).ok,
    ).toBe(false);
  });

  it('erro quando falta data', () => {
    const r = resolverPeriodoPersonalizado({ inicioIso: '2025-01-01', fimIso: '', hojeUtc: hoje });
    expect(r.ok).toBe(false);
  });
});

describe('cortarNoFim', () => {
  const serie = [
    { date: utc(2026, 1, 1), value: 0 },
    { date: utc(2026, 1, 2), value: 1 },
    { date: utc(2026, 1, 3), value: 2 },
  ];
  it('mantém até o fim inclusive', () => {
    expect(cortarNoFim(serie, utc(2026, 1, 2)).map((p) => p.value)).toEqual([0, 1]);
  });
  it('sem fim devolve a série inteira', () => {
    expect(cortarNoFim(serie)).toBe(serie);
  });
});

describe('rótulo, range de índices e iso', () => {
  it('formata dd/mm/aaaa – dd/mm/aaaa', () => {
    expect(rotuloPeriodo({ inicio: utc(2020, 2, 5), fim: utc(2026, 9, 1) })).toBe(
      '05/02/2020 – 01/09/2026',
    );
  });
  it('escolhe o range que cobre o início', () => {
    const hoje = utc(2026, 9, 2);
    expect(indicesRangeParaInicio(utc(2026, 3, 1), hoje)).toBe('1y');
    expect(indicesRangeParaInicio(utc(2025, 1, 1), hoje)).toBe('2y');
    expect(indicesRangeParaInicio(utc(2023, 1, 1), hoje)).toBe('5y');
    expect(indicesRangeParaInicio(utc(2015, 1, 1), hoje)).toBe('10y');
  });
  it('toIsoDateUtc é o inverso do parse', () => {
    expect(toIsoDateUtc(utc(2026, 9, 1))).toBe('2026-09-01');
  });
});
