import { describe, it, expect } from 'vitest';
import {
  calcularIRRendaFixa,
  classifyForIR,
  aliquotaTabelaRegressiva,
  aliquotaIof,
} from '../fixedIncomeIR';

describe('aliquotaTabelaRegressiva', () => {
  it('22.5% até 180 dias', () => {
    expect(aliquotaTabelaRegressiva(0)).toBe(0.225);
    expect(aliquotaTabelaRegressiva(180)).toBe(0.225);
  });
  it('20% entre 181 e 360', () => {
    expect(aliquotaTabelaRegressiva(181)).toBe(0.2);
    expect(aliquotaTabelaRegressiva(360)).toBe(0.2);
  });
  it('17.5% entre 361 e 720', () => {
    expect(aliquotaTabelaRegressiva(361)).toBe(0.175);
    expect(aliquotaTabelaRegressiva(720)).toBe(0.175);
  });
  it('15% acima de 720 dias', () => {
    expect(aliquotaTabelaRegressiva(721)).toBe(0.15);
    expect(aliquotaTabelaRegressiva(3650)).toBe(0.15);
  });
});

describe('classifyForIR', () => {
  it('LCI/LCA/CRI/CRA/LIG são isentos', () => {
    expect(classifyForIR('LCI_PRE', false).category).toBe('isento');
    expect(classifyForIR('LCA_HIB', false).category).toBe('isento');
    expect(classifyForIR('CRI_PRE', false).category).toBe('isento');
    expect(classifyForIR('CRA_PRE', false).category).toBe('isento');
    expect(classifyForIR('LIG_PRE', false).category).toBe('isento');
  });
  it('CDB/LC/RDB seguem tabela regressiva', () => {
    expect(classifyForIR('CDB_PRE', false).category).toBe('tabela_regressiva');
    expect(classifyForIR('LC_PRE', false).category).toBe('tabela_regressiva');
    expect(classifyForIR('RDB_PRE', false).category).toBe('tabela_regressiva');
    expect(classifyForIR('LF_PRE', false).category).toBe('tabela_regressiva');
    expect(classifyForIR('DPGE_HIB', false).category).toBe('tabela_regressiva');
  });
  it('Tesouro nunca é isento, mesmo se type for null', () => {
    expect(classifyForIR(null, true).category).toBe('tabela_regressiva');
    expect(classifyForIR('CDB_PRE', true).category).toBe('tabela_regressiva');
  });
  it('expõe motivo da isenção', () => {
    expect(classifyForIR('LCI_HIB', false).motivoIsencao).toBe('LCI');
    expect(classifyForIR('CDB_PRE', false).motivoIsencao).toBeNull();
  });
});

describe('calcularIRRendaFixa', () => {
  const start = new Date('2025-01-01');

  it('CDB com 90 dias e R$100 de rendimento → 22.5% IR', () => {
    const result = calcularIRRendaFixa({
      type: 'CDB_PRE',
      isTesouro: false,
      startDate: start,
      asOfDate: new Date('2025-04-01'), // ~90 dias
      valorAplicado: 1000,
      saldoBruto: 1100,
    });
    expect(result.diasDecorridos).toBe(90);
    expect(result.aliquota).toBe(0.225);
    expect(result.ir).toBe(22.5);
    expect(result.valorLiquido).toBe(1077.5);
    expect(result.isento).toBe(false);
  });

  it('CDB com 1000 dias e R$1000 de rendimento → 15% IR', () => {
    const result = calcularIRRendaFixa({
      type: 'CDB_PRE',
      isTesouro: false,
      startDate: start,
      asOfDate: new Date(start.getTime() + 1000 * 86400000),
      valorAplicado: 10000,
      saldoBruto: 11000,
    });
    expect(result.aliquota).toBe(0.15);
    expect(result.ir).toBe(150);
    expect(result.valorLiquido).toBe(10850);
  });

  it('LCI nunca tem IR, qualquer prazo', () => {
    const result = calcularIRRendaFixa({
      type: 'LCI_PRE',
      isTesouro: false,
      startDate: start,
      asOfDate: new Date('2025-06-01'),
      valorAplicado: 1000,
      saldoBruto: 1100,
    });
    expect(result.isento).toBe(true);
    expect(result.motivoIsencao).toBe('LCI');
    expect(result.aliquota).toBe(0);
    expect(result.ir).toBe(0);
    expect(result.valorLiquido).toBe(1100);
  });

  it('Tesouro NUNCA é isento (mesmo com type=null)', () => {
    const result = calcularIRRendaFixa({
      type: null,
      isTesouro: true,
      startDate: start,
      asOfDate: new Date(start.getTime() + 200 * 86400000),
      valorAplicado: 5000,
      saldoBruto: 5500,
    });
    expect(result.isento).toBe(false);
    expect(result.aliquota).toBe(0.2); // 200 dias → 20%
    expect(result.ir).toBe(100); // 500 * 0.2
  });

  it('rendimento negativo (marcação a mercado adversa) não gera IR', () => {
    const result = calcularIRRendaFixa({
      type: 'CDB_PRE',
      isTesouro: false,
      startDate: start,
      asOfDate: new Date('2025-04-01'),
      valorAplicado: 1000,
      saldoBruto: 950,
    });
    expect(result.ir).toBe(0);
    expect(result.valorLiquido).toBe(950);
    expect(result.rendimentoBruto).toBe(-50);
    expect(result.aliquota).toBe(0);
  });

  it('rendimento zero não gera IR', () => {
    const result = calcularIRRendaFixa({
      type: 'CDB_PRE',
      isTesouro: false,
      startDate: start,
      asOfDate: new Date('2025-04-01'),
      valorAplicado: 1000,
      saldoBruto: 1000,
    });
    expect(result.ir).toBe(0);
    expect(result.valorLiquido).toBe(1000);
  });

  it('asOfDate default = agora', () => {
    const result = calcularIRRendaFixa({
      type: 'CDB_PRE',
      isTesouro: false,
      startDate: new Date(Date.now() - 100 * 86400000),
      valorAplicado: 1000,
      saldoBruto: 1100,
    });
    expect(result.diasDecorridos).toBeGreaterThanOrEqual(99);
    expect(result.diasDecorridos).toBeLessThanOrEqual(101);
    expect(result.aliquota).toBe(0.225);
  });

  it('LCA híbrida com 5 anos é isenta', () => {
    const result = calcularIRRendaFixa({
      type: 'LCA_HIB',
      isTesouro: false,
      startDate: start,
      asOfDate: new Date(start.getTime() + 5 * 365 * 86400000),
      valorAplicado: 10000,
      saldoBruto: 15000,
    });
    expect(result.isento).toBe(true);
    expect(result.motivoIsencao).toBe('LCA');
    expect(result.iof).toBe(0);
    expect(result.ir).toBe(0);
  });
});

describe('aliquotaIof', () => {
  it('dia 1 → 96%, dia 15 → 50%, dia 29 → 3%', () => {
    expect(aliquotaIof(1)).toBe(0.96);
    expect(aliquotaIof(15)).toBe(0.5);
    expect(aliquotaIof(29)).toBe(0.03);
  });
  it('dia 30 e além → 0%', () => {
    expect(aliquotaIof(30)).toBe(0);
    expect(aliquotaIof(31)).toBe(0);
    expect(aliquotaIof(365)).toBe(0);
  });
});

describe('calcularIRRendaFixa — IOF nos primeiros 30 dias', () => {
  const start = new Date('2025-01-01');

  it('CDB resgatado em 10 dias: IOF 66% sobre rendimento e IR sobre o saldo', () => {
    const result = calcularIRRendaFixa({
      type: 'CDB_PRE',
      isTesouro: false,
      startDate: start,
      asOfDate: new Date(start.getTime() + 10 * 86400000),
      valorAplicado: 1000,
      saldoBruto: 1100, // rendimento R$100
    });
    expect(result.diasDecorridos).toBe(10);
    expect(result.iof).toBe(66); // 100 * 0.66
    // base IR = 100 - 66 = 34, alíquota 22.5% → 7.65
    expect(result.aliquota).toBe(0.225);
    expect(result.ir).toBe(7.65);
    expect(result.valorLiquido).toBe(1100 - 66 - 7.65);
  });

  it('LCI nos primeiros 30 dias NÃO sofre IOF (isento)', () => {
    const result = calcularIRRendaFixa({
      type: 'LCI_PRE',
      isTesouro: false,
      startDate: start,
      asOfDate: new Date(start.getTime() + 5 * 86400000),
      valorAplicado: 1000,
      saldoBruto: 1100,
    });
    expect(result.isento).toBe(true);
    expect(result.iof).toBe(0);
    expect(result.ir).toBe(0);
  });

  it('CDB com 30 dias: IOF zerado', () => {
    const result = calcularIRRendaFixa({
      type: 'CDB_PRE',
      isTesouro: false,
      startDate: start,
      asOfDate: new Date(start.getTime() + 30 * 86400000),
      valorAplicado: 1000,
      saldoBruto: 1100,
    });
    expect(result.iof).toBe(0);
    expect(result.ir).toBe(22.5); // 100 * 0.225
  });

  it('Tesouro nos primeiros 30 dias também sofre IOF', () => {
    const result = calcularIRRendaFixa({
      type: null,
      isTesouro: true,
      startDate: start,
      asOfDate: new Date(start.getTime() + 5 * 86400000),
      valorAplicado: 1000,
      saldoBruto: 1100,
    });
    expect(result.iof).toBeGreaterThan(0);
    expect(result.iof).toBe(83); // 100 * 0.83
  });
});
