import { describe, expect, it } from 'vitest';
import { computeSaudeFinanceira, ganhoRealAA, type SaudeFinanceiraInputs } from '../indicadores';

/**
 * Cenário base = o exemplo preenchido da planilha "Saúde Financeira Após
 * Recomendações" (cliente CLT): renda 13k, gasto 9k, ativos curto prazo
 * 106.822,93, ativos longo prazo 97.475, financiamento imobiliário 47.040.
 */
const baseInputs: SaudeFinanceiraInputs = {
  rendaMensal: 13000,
  gastoMensal: 9000,
  idade: null,
  rentabilidadeCarteiraAA: 0.115,
  cdiAA: 0.105,
  inflacaoAA: 0.045,
  ativosAltaLiquidez: 106822.93,
  ativosBaixaLiquidez: 97475,
  reservaEmergencia: 106822.93,
  passivosCurtoPrazo: 0,
  passivosLongoPrazo: 47040,
};

describe('ganhoRealAA', () => {
  it('aplica a fórmula de Fisher (planilha: 11,5% nominal, 4,5% inflação)', () => {
    expect(ganhoRealAA(0.115, 0.045)).toBeCloseTo(0.06698564593301448, 10);
  });

  it('inflação acima da rentabilidade dá ganho real negativo', () => {
    expect(ganhoRealAA(0.04, 0.06)).toBeLessThan(0);
  });
});

describe('computeSaudeFinanceira — cenário da planilha', () => {
  const r = computeSaudeFinanceira(baseInputs);

  it('fluxo de caixa: poupança 4.000 e taxa ~30,77%', () => {
    expect(r.fluxo.poupancaMensal).toBe(4000);
    expect(r.fluxo.taxaPoupanca).toBeCloseTo(0.3076923, 5);
  });

  it('benchmark reserva de emergência = 3× gasto (27.000)', () => {
    expect(r.benchmarks.reservaEmergencia.necessario).toBe(27000);
    expect(r.benchmarks.reservaEmergencia.atingido).toBeCloseTo(3.9564, 3);
  });

  it('benchmark patrimônio de segurança = 12× gasto (108.000)', () => {
    expect(r.benchmarks.patrimonioSeguranca.necessario).toBe(108000);
    expect(r.benchmarks.patrimonioSeguranca.atingido).toBeCloseTo(0.9891, 3);
  });

  it('benchmark independência = gasto anual / ganho real (~1.612.285,71)', () => {
    expect(r.benchmarks.independencia.necessario).toBeCloseTo(1612285.71, 1);
  });

  it('patrimônio líquido = ativos − passivos (157.257,93, valor da planilha)', () => {
    expect(r.balanco.patrimonioLiquido).toBeCloseTo(157257.93, 2);
  });

  it('grau de independência ~9,75% (célula E66 da planilha)', () => {
    expect(r.metricas.grauIndependencia).toBeCloseTo(0.09753725943647014, 8);
  });

  it('meses de cobertura ~11,87 e status EQ sem motivos', () => {
    expect(r.metricas.mesesCobertura).toBeCloseTo(11.8692, 3);
    expect(r.status.codigo).toBe('EQ');
    expect(r.status.motivos).toEqual([]);
  });

  it('usa a rentabilidade da carteira quando disponível', () => {
    expect(r.economia.rentabilidadeFonte).toBe('carteira');
    expect(r.economia.ganhoRealAA).toBeCloseTo(0.066986, 5);
  });
});

describe('computeSaudeFinanceira — status ED (Endividado)', () => {
  it('passivo curto prazo acima dos ativos líquidos', () => {
    const r = computeSaudeFinanceira({
      ...baseInputs,
      ativosAltaLiquidez: 5000,
      reservaEmergencia: 5000,
      passivosCurtoPrazo: 12000,
    });
    expect(r.status.codigo).toBe('ED');
    expect(r.status.motivos).toContain(
      'Dívidas de curto prazo maiores que os ativos de alta liquidez',
    );
  });

  it('passivo total acima de 50% do ativo total', () => {
    const r = computeSaudeFinanceira({ ...baseInputs, passivosLongoPrazo: 150000 });
    expect(r.status.codigo).toBe('ED');
    expect(r.status.motivos).toContain('Dívidas somam mais da metade do patrimônio total');
  });

  it('poupança mensal negativa', () => {
    const r = computeSaudeFinanceira({ ...baseInputs, gastoMensal: 15000 });
    expect(r.status.codigo).toBe('ED');
    expect(r.status.motivos).toContain('Gastos mensais acima da renda');
    expect(r.fluxo.poupancaMensal).toBe(-2000);
  });

  it('ED tem precedência sobre FR (acumula só motivos de ED)', () => {
    const r = computeSaudeFinanceira({
      ...baseInputs,
      ativosAltaLiquidez: 1000, // cobertura < 6 meses (seria FR)...
      reservaEmergencia: 0,
      passivosCurtoPrazo: 5000, // ...mas endividamento CP classifica ED
    });
    expect(r.status.codigo).toBe('ED');
  });
});

describe('computeSaudeFinanceira — status FR (Frágil)', () => {
  it('cobertura abaixo de 6 meses', () => {
    const r = computeSaudeFinanceira({
      ...baseInputs,
      ativosAltaLiquidez: 30000, // 3,33 meses de gasto
      reservaEmergencia: 30000, // acima do benchmark de 27k
      passivosCurtoPrazo: 0,
      passivosLongoPrazo: 0,
    });
    expect(r.status.codigo).toBe('FR');
    expect(r.status.motivos).toContain('Ativos líquidos cobrem menos de 6 meses de gastos');
  });

  it('reserva de emergência abaixo de 3× gasto', () => {
    const r = computeSaudeFinanceira({
      ...baseInputs,
      reservaEmergencia: 10000, // < 27k, mesmo com alta liquidez total ok
    });
    expect(r.status.codigo).toBe('FR');
    expect(r.status.motivos).toContain('Reserva de emergência abaixo do necessário');
  });
});

describe('computeSaudeFinanceira — config personalizada (F4)', () => {
  it('multiplicadores customizados mudam os benchmarks', () => {
    const r = computeSaudeFinanceira(
      { ...baseInputs, idade: 30 },
      { multReserva: 6, multSeguranca: 24, fatorIdeal: 0.2, coberturaMinimaMeses: 12 },
    );
    expect(r.benchmarks.reservaEmergencia.necessario).toBe(54000); // 6×9000
    expect(r.benchmarks.patrimonioSeguranca.necessario).toBe(216000); // 24×9000
    expect(r.benchmarks.patrimonioIdeal.necessario).toBe(936000); // 20%×156000×30
  });

  it('coberturaMinimaMeses customizada muda o corte do status Frágil', () => {
    // Cobertura ~11,87 meses: EQ com corte 6 (default), FR com corte 12.
    const r = computeSaudeFinanceira(baseInputs, {
      multReserva: 3,
      multSeguranca: 12,
      fatorIdeal: 0.1,
      coberturaMinimaMeses: 12,
    });
    expect(r.status.codigo).toBe('FR');
    expect(r.status.motivos).toContain('Ativos líquidos cobrem menos de 12 meses de gastos');
  });
});

describe('computeSaudeFinanceira — casos de borda', () => {
  it('gasto mensal zero: benchmarks de gasto e cobertura incalculáveis, sem crash', () => {
    const r = computeSaudeFinanceira({ ...baseInputs, gastoMensal: 0 });
    expect(r.benchmarks.reservaEmergencia.necessario).toBeNull();
    expect(r.benchmarks.patrimonioSeguranca.necessario).toBeNull();
    expect(r.benchmarks.independencia.necessario).toBeNull();
    expect(r.metricas.mesesCobertura).toBeNull();
  });

  it('renda zero: taxa de poupança null, patrimônio ideal incalculável', () => {
    const r = computeSaudeFinanceira({ ...baseInputs, rendaMensal: 0, idade: 35 });
    expect(r.fluxo.taxaPoupanca).toBeNull();
    expect(r.benchmarks.patrimonioIdeal.necessario).toBeNull();
  });

  it('sem idade: patrimônio ideal incalculável; com idade calcula 10%×renda anual×idade', () => {
    expect(computeSaudeFinanceira(baseInputs).benchmarks.patrimonioIdeal.necessario).toBeNull();
    const r = computeSaudeFinanceira({ ...baseInputs, idade: 30 });
    // 10% × (13000×12) × 30 = 468.000
    expect(r.benchmarks.patrimonioIdeal.necessario).toBe(468000);
  });

  it('sem TWR da carteira cai no CDI como proxy', () => {
    const r = computeSaudeFinanceira({ ...baseInputs, rentabilidadeCarteiraAA: null });
    expect(r.economia.rentabilidadeFonte).toBe('cdi');
    expect(r.economia.ganhoRealAA).toBeCloseTo(ganhoRealAA(0.105, 0.045), 10);
  });

  it('sem TWR nem CDI: ganho real e independência incalculáveis', () => {
    const r = computeSaudeFinanceira({
      ...baseInputs,
      rentabilidadeCarteiraAA: null,
      cdiAA: null,
    });
    expect(r.economia.rentabilidadeFonte).toBeNull();
    expect(r.economia.ganhoRealAA).toBeNull();
    expect(r.benchmarks.independencia.necessario).toBeNull();
    expect(r.metricas.grauIndependencia).toBeNull();
  });

  it('ganho real negativo: independência incalculável (perpetuidade não fecha)', () => {
    const r = computeSaudeFinanceira({ ...baseInputs, rentabilidadeCarteiraAA: 0.02 });
    expect(r.benchmarks.independencia.necessario).toBeNull();
  });

  it('usuário zerado: tudo null/zero, status FR (sem reserva), sem NaN', () => {
    const r = computeSaudeFinanceira({
      rendaMensal: 1000,
      gastoMensal: 800,
      idade: null,
      rentabilidadeCarteiraAA: null,
      cdiAA: null,
      inflacaoAA: 0.045,
      ativosAltaLiquidez: 0,
      ativosBaixaLiquidez: 0,
      reservaEmergencia: 0,
      passivosCurtoPrazo: 0,
      passivosLongoPrazo: 0,
    });
    expect(r.balanco.patrimonioLiquido).toBe(0);
    expect(r.metricas.passivoSobreAtivo).toBeNull();
    expect(r.metricas.endividamentoCurtoPrazo).toBeNull();
    expect(r.status.codigo).toBe('FR');
    expect(JSON.stringify(r)).not.toContain('NaN');
  });
});
