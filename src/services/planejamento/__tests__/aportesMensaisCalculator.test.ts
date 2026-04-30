import { describe, it, expect } from 'vitest';
import {
  simulateAportes,
  calcularAporteMensal,
  type AportesMensaisInputs,
} from '../aportesMensaisCalculator';

const baseInputs: AportesMensaisInputs = {
  patrimonioInicial: 100_000,
  metaPatrimonio: 1_000_000,
  prazoAnos: 20,
  retornoNominalAnual: 12,
  inflacaoAnual: 4,
};

describe('calcularAporteMensal', () => {
  it('caso simples PV=0, meta=12000, 1 ano, taxa real 0% → aporte ≈ 1000', () => {
    const r = calcularAporteMensal({
      patrimonioInicial: 0,
      metaPatrimonio: 12_000,
      prazoAnos: 1,
      retornoRealAnual: 0,
    });
    expect(r.metaJaAtingida).toBe(false);
    expect(r.aporteMensal).toBeCloseTo(1000, 2);
  });

  it('marca metaJaAtingida=true e aporteMensal=0 quando PV cresce além da meta', () => {
    const r = calcularAporteMensal({
      patrimonioInicial: 1_000_000,
      metaPatrimonio: 500_000,
      prazoAnos: 5,
      retornoRealAnual: 0.05,
    });
    expect(r.metaJaAtingida).toBe(true);
    expect(r.aporteMensal).toBe(0);
  });

  it('meta exatamente igual à projeção do PV → metaJaAtingida=true', () => {
    const pv = 100_000;
    const i = Math.pow(1 + 0.06, 1 / 12) - 1;
    const meta = pv * Math.pow(1 + i, 60);
    const r = calcularAporteMensal({
      patrimonioInicial: pv,
      metaPatrimonio: meta,
      prazoAnos: 5,
      retornoRealAnual: 0.06,
    });
    expect(r.metaJaAtingida).toBe(true);
  });
});

describe('simulateAportes — happy path', () => {
  it('retorna 3 cenários sempre na ordem Pessimista, Base, Otimista', () => {
    const r = simulateAportes(baseInputs);
    expect(r.warnings).toEqual([]);
    expect(r.cenarios).toHaveLength(3);
    expect(r.cenarios.map((c) => c.label)).toEqual(['Pessimista', 'Base', 'Otimista']);
  });

  it('cenário Pessimista exige aporte maior que Base, e Base maior que Otimista', () => {
    const r = simulateAportes(baseInputs);
    const [pess, base, otim] = r.cenarios;
    expect(pess.aporteMensal).toBeGreaterThan(base.aporteMensal);
    expect(base.aporteMensal).toBeGreaterThan(otim.aporteMensal);
  });

  it('retorno nominal de cada cenário é base ± 2pp', () => {
    const r = simulateAportes(baseInputs);
    const [pess, base, otim] = r.cenarios;
    expect(pess.retornoNominal).toBe(10);
    expect(base.retornoNominal).toBe(12);
    expect(otim.retornoNominal).toBe(14);
  });

  it('projeção base tem prazoAnos linhas e idadeOuPrazo crescente de 1..N', () => {
    const r = simulateAportes(baseInputs);
    expect(r.projecaoBase).toHaveLength(baseInputs.prazoAnos);
    r.projecaoBase.forEach((row, idx) => {
      expect(row.idadeOuPrazo).toBe(idx + 1);
    });
  });

  it('continuidade: patrimonioInicio[i+1] === patrimonioFim[i]', () => {
    const r = simulateAportes(baseInputs);
    for (let i = 1; i < r.projecaoBase.length; i++) {
      expect(r.projecaoBase[i].patrimonioInicio).toBeCloseTo(
        r.projecaoBase[i - 1].patrimonioFim,
        4,
      );
    }
  });

  it('projeção é monotonicamente crescente quando taxa real e aporte > 0', () => {
    const r = simulateAportes(baseInputs);
    for (let i = 1; i < r.projecaoBase.length; i++) {
      expect(r.projecaoBase[i].patrimonioFim).toBeGreaterThan(r.projecaoBase[i - 1].patrimonioFim);
    }
  });

  it('projeção base atinge aproximadamente a meta no último ano', () => {
    const r = simulateAportes(baseInputs);
    const ultimo = r.projecaoBase[r.projecaoBase.length - 1];
    expect(ultimo.patrimonioFim).toBeCloseTo(baseInputs.metaPatrimonio, -2);
  });

  it('inflação 0 → retornoReal == retornoNominal (em decimal)', () => {
    const r = simulateAportes({ ...baseInputs, inflacaoAnual: 0 });
    const base = r.cenarios.find((c) => c.label === 'Base')!;
    expect(base.retornoReal).toBeCloseTo(0.12, 6);
  });

  it('marca metaJaAtingida=true em todos cenários quando PV grande / prazo curto', () => {
    const r = simulateAportes({
      ...baseInputs,
      patrimonioInicial: 5_000_000,
      metaPatrimonio: 1_000_000,
      prazoAnos: 1,
    });
    r.cenarios.forEach((c) => {
      expect(c.metaJaAtingida).toBe(true);
      expect(c.aporteMensal).toBe(0);
    });
  });
});

describe('simulateAportes — validações', () => {
  it('prazo <= 0 popula warnings e retorna arrays vazios', () => {
    const r = simulateAportes({ ...baseInputs, prazoAnos: 0 });
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.cenarios).toEqual([]);
    expect(r.projecaoBase).toEqual([]);
  });

  it('meta <= 0 popula warnings', () => {
    const r = simulateAportes({ ...baseInputs, metaPatrimonio: 0 });
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('patrimônio inicial negativo popula warnings', () => {
    const r = simulateAportes({ ...baseInputs, patrimonioInicial: -100 });
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('inflação negativa popula warnings', () => {
    const r = simulateAportes({ ...baseInputs, inflacaoAnual: -1 });
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('retorno nominal <= inflação avisa sobre taxa real não-positiva', () => {
    const r = simulateAportes({ ...baseInputs, retornoNominalAnual: 4, inflacaoAnual: 4 });
    expect(r.warnings.some((w) => w.toLowerCase().includes('real'))).toBe(true);
  });
});
