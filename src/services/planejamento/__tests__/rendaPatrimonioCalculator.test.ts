import { describe, it, expect } from 'vitest';
import {
  calcularRendaPatrimonio,
  ESTRATEGIA_ORDEM,
  type RendaPatrimonioInputs,
} from '../rendaPatrimonioCalculator';

const baseInputs: RendaPatrimonioInputs = {
  patrimonio: 1_000_000,
  retornoNominalAnual: 10,
  inflacaoAnual: 4,
  horizonteAnos: 30,
};

const realRate = (nominal: number, inflacao: number): number =>
  (1 + nominal / 100) / (1 + inflacao / 100) - 1;

describe('calcularRendaPatrimonio', () => {
  it('produz exatamente as 3 estratégias na ordem [perpetua, programado, regra-4-pct]', () => {
    const r = calcularRendaPatrimonio(baseInputs);
    expect(r.estrategias.map((e) => e.estrategia)).toEqual([
      'perpetua',
      'programado',
      'regra-4-pct',
    ]);
    expect(ESTRATEGIA_ORDEM).toEqual(['perpetua', 'programado', 'regra-4-pct']);
  });

  it('renda perpétua = patrimonio * realRate / 12', () => {
    const r = calcularRendaPatrimonio(baseInputs);
    const expected = (baseInputs.patrimonio * realRate(10, 4)) / 12;
    const perpetua = r.estrategias.find((e) => e.estrategia === 'perpetua');
    expect(perpetua?.rendaMensal).toBeCloseTo(expected, 2);
    expect(perpetua?.duracao).toBe('perpetua');
  });

  it('regra dos 4%: renda inicial = patrimonio * 0.04 / 12 (taxa default)', () => {
    const r = calcularRendaPatrimonio(baseInputs);
    const regra = r.estrategias.find((e) => e.estrategia === 'regra-4-pct');
    expect(regra?.rendaMensal).toBeCloseTo((baseInputs.patrimonio * 0.04) / 12, 2);
  });

  it('regra de saque customizada (e.g. 3.5%) altera renda inicial proporcionalmente', () => {
    const r = calcularRendaPatrimonio({ ...baseInputs, taxaSaqueAnualPct: 3.5 });
    const regra = r.estrategias.find((e) => e.estrategia === 'regra-4-pct');
    expect(regra?.rendaMensal).toBeCloseTo((baseInputs.patrimonio * 0.035) / 12, 2);
    expect(regra?.label).toContain('3.5');
  });

  it('programado: trajetória chega em ~0 no último ano (tolerância 1 R$)', () => {
    const r = calcularRendaPatrimonio(baseInputs);
    const traj = r.trajetorias.programado;
    expect(traj.length).toBe(baseInputs.horizonteAnos);
    expect(Math.abs(traj[traj.length - 1].saldoFim)).toBeLessThan(1);
  });

  it('programado: aumentar horizonte diminui renda mensal (monotonicidade)', () => {
    const r10 = calcularRendaPatrimonio({ ...baseInputs, horizonteAnos: 10 });
    const r30 = calcularRendaPatrimonio({ ...baseInputs, horizonteAnos: 30 });
    const r50 = calcularRendaPatrimonio({ ...baseInputs, horizonteAnos: 50 });
    const get = (out: ReturnType<typeof calcularRendaPatrimonio>): number =>
      out.estrategias.find((e) => e.estrategia === 'programado')!.rendaMensal;
    expect(get(r10)).toBeGreaterThan(get(r30));
    expect(get(r30)).toBeGreaterThan(get(r50));
  });

  it('perpétua é a estratégia de menor renda mensal (em retorno real positivo)', () => {
    const r = calcularRendaPatrimonio(baseInputs);
    const perp = r.estrategias.find((e) => e.estrategia === 'perpetua')!;
    const prog = r.estrategias.find((e) => e.estrategia === 'programado')!;
    expect(prog.rendaMensal).toBeGreaterThan(perp.rendaMensal);
  });

  it('continuidade da trajetória programado: saldoInicio[i+1] === saldoFim[i]', () => {
    const r = calcularRendaPatrimonio(baseInputs);
    const traj = r.trajetorias.programado;
    for (let i = 1; i < traj.length; i++) {
      expect(traj[i].saldoInicio).toBeCloseTo(traj[i - 1].saldoFim, 6);
    }
  });

  it('continuidade da trajetória regra-4-pct: saldoInicio[i+1] === saldoFim[i]', () => {
    const r = calcularRendaPatrimonio(baseInputs);
    const traj = r.trajetorias['regra-4-pct'];
    for (let i = 1; i < traj.length; i++) {
      expect(traj[i].saldoInicio).toBeCloseTo(traj[i - 1].saldoFim, 6);
    }
  });

  it('perpétua: saldo permanece constante em valores reais (juros == saques cada ano)', () => {
    const r = calcularRendaPatrimonio(baseInputs);
    const traj = r.trajetorias.perpetua;
    expect(traj.length).toBe(baseInputs.horizonteAnos);
    for (const ano of traj) {
      expect(ano.saldoFim).toBeCloseTo(baseInputs.patrimonio, 4);
      expect(ano.saques).toBeCloseTo(ano.juros, 4);
    }
  });

  it('retorno real negativo: estratégia perpétua sinaliza warning', () => {
    const r = calcularRendaPatrimonio({
      ...baseInputs,
      retornoNominalAnual: 2,
      inflacaoAnual: 6,
    });
    expect(r.warnings.some((w) => w.toLowerCase().includes('perpétua'))).toBe(true);
    const perp = r.estrategias.find((e) => e.estrategia === 'perpetua')!;
    expect(perp.rendaMensal).toBe(0);
  });

  it('regra 4% com retorno real abaixo de 4% e horizonte longo: trajetória esgota antes', () => {
    const r = calcularRendaPatrimonio({
      ...baseInputs,
      retornoNominalAnual: 5,
      inflacaoAnual: 4,
      horizonteAnos: 60,
    });
    const traj = r.trajetorias['regra-4-pct'];
    expect(traj[traj.length - 1].saldoFim).toBe(0);
    expect(traj.length).toBeLessThan(60);
    expect(r.warnings.some((w) => w.toLowerCase().includes('esgotaria'))).toBe(true);
  });

  it('patrimônio = 0: warnings populados, estruturas vazias mas válidas', () => {
    const r = calcularRendaPatrimonio({ ...baseInputs, patrimonio: 0 });
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.estrategias).toEqual([]);
    expect(r.trajetorias.perpetua).toEqual([]);
    expect(r.trajetorias.programado).toEqual([]);
    expect(r.trajetorias['regra-4-pct']).toEqual([]);
  });

  it('horizonte = 0: warnings populados, estruturas vazias', () => {
    const r = calcularRendaPatrimonio({ ...baseInputs, horizonteAnos: 0 });
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.estrategias).toEqual([]);
  });

  it('horizonte negativo: warnings populados', () => {
    const r = calcularRendaPatrimonio({ ...baseInputs, horizonteAnos: -5 });
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('todas trajetórias usam o mesmo horizonte quando não há esgotamento antecipado', () => {
    const r = calcularRendaPatrimonio(baseInputs);
    expect(r.trajetorias.perpetua.length).toBe(baseInputs.horizonteAnos);
    expect(r.trajetorias.programado.length).toBe(baseInputs.horizonteAnos);
    expect(r.trajetorias['regra-4-pct'].length).toBe(baseInputs.horizonteAnos);
  });

  it('cada estratégia tem observação não vazia explicando o trade-off', () => {
    const r = calcularRendaPatrimonio(baseInputs);
    for (const e of r.estrategias) {
      expect(typeof e.observacao).toBe('string');
      expect(e.observacao.length).toBeGreaterThan(10);
    }
  });
});
