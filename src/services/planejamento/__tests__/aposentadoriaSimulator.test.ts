import { describe, it, expect } from 'vitest';
import {
  simulateAposentadoria,
  PERFIS_RETORNO,
  type AposentadoriaInputs,
} from '../aposentadoriaSimulator';

const baseInputs: AposentadoriaInputs = {
  idadeAtual: 30,
  idadeAposentadoria: 60,
  expectativaVida: 90,
  patrimonioInicial: 100_000,
  aporteMensal: 2_000,
  rendaDesejadaMensal: 8_000,
  perfil: 'moderado',
  inflacao: 4,
};

describe('simulateAposentadoria', () => {
  it('produz array de tamanho expectativa - idadeAtual quando há saldo até o fim', () => {
    const r = simulateAposentadoria(baseInputs);
    expect(r.warnings).toEqual([]);
    expect(r.anos.length).toBeLessThanOrEqual(60);
    expect(r.anos[0].idade).toBe(30);
    expect(r.anos[0].fase).toBe('acumulacao');
  });

  it('marca corretamente fase de acumulacao até idadeAposentadoria-1 e retirada depois', () => {
    const r = simulateAposentadoria(baseInputs);
    const acumAnos = r.anos.filter((a) => a.fase === 'acumulacao');
    const retAnos = r.anos.filter((a) => a.fase === 'retirada');
    expect(acumAnos.every((a) => a.idade < 60)).toBe(true);
    expect(retAnos.every((a) => a.idade >= 60)).toBe(true);
    expect(acumAnos.length).toBe(30);
  });

  it('patrimônio cresce monotonicamente durante acumulação com retorno real positivo', () => {
    const r = simulateAposentadoria(baseInputs);
    const acum = r.anos.filter((a) => a.fase === 'acumulacao');
    for (let i = 1; i < acum.length; i++) {
      expect(acum[i].patrimonioFim).toBeGreaterThan(acum[i - 1].patrimonioFim);
    }
  });

  it('patrimonioNaAposentadoria reflete saldo no início da fase de retirada', () => {
    const r = simulateAposentadoria(baseInputs);
    const ultimoAcum = r.anos.find((a) => a.idade === 59);
    expect(ultimoAcum?.patrimonioFim).toBeCloseTo(r.patrimonioNaAposentadoria, 2);
  });

  it('detecta esgotamento quando renda desejada > capacidade', () => {
    const r = simulateAposentadoria({
      ...baseInputs,
      patrimonioInicial: 50_000,
      aporteMensal: 100,
      rendaDesejadaMensal: 50_000,
    });
    expect(r.metaAtingida).toBe(false);
    expect(r.idadeEsgotamento).not.toBeNull();
    expect(r.idadeEsgotamento).toBeGreaterThanOrEqual(60);
  });

  it('último ano antes do esgotamento tem saque parcial (saldo zera, não negativa)', () => {
    const r = simulateAposentadoria({
      ...baseInputs,
      patrimonioInicial: 200_000,
      aporteMensal: 0,
      rendaDesejadaMensal: 50_000,
    });
    const ultimo = r.anos[r.anos.length - 1];
    expect(ultimo.patrimonioFim).toBe(0);
    expect(ultimo.saques).toBeGreaterThan(0);
    expect(r.idadeEsgotamento).toBe(ultimo.idade + 1);
  });

  it('marca metaAtingida=true quando patrimônio dura até expectativa', () => {
    const r = simulateAposentadoria({
      ...baseInputs,
      patrimonioInicial: 5_000_000,
      rendaDesejadaMensal: 5_000,
    });
    expect(r.metaAtingida).toBe(true);
    expect(r.idadeEsgotamento).toBeNull();
  });

  it('valida idade de aposentadoria > idade atual', () => {
    const r = simulateAposentadoria({ ...baseInputs, idadeAposentadoria: 25 });
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.anos).toEqual([]);
  });

  it('valida expectativa > idade aposentadoria', () => {
    const r = simulateAposentadoria({ ...baseInputs, expectativaVida: 55 });
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('valida renda desejada > 0', () => {
    const r = simulateAposentadoria({ ...baseInputs, rendaDesejadaMensal: 0 });
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('perfil personalizado usa retornos custom', () => {
    const r1 = simulateAposentadoria({
      ...baseInputs,
      perfil: 'personalizado',
      retornoCustomAcumulacao: 20,
      retornoCustomRetirada: 15,
    });
    const r2 = simulateAposentadoria({
      ...baseInputs,
      perfil: 'personalizado',
      retornoCustomAcumulacao: 5,
      retornoCustomRetirada: 3,
    });
    expect(r1.patrimonioNaAposentadoria).toBeGreaterThan(r2.patrimonioNaAposentadoria);
  });

  it('perfil arrojado acumula mais que conservador (mesmos demais inputs)', () => {
    const conservador = simulateAposentadoria({ ...baseInputs, perfil: 'conservador' });
    const arrojado = simulateAposentadoria({ ...baseInputs, perfil: 'arrojado' });
    expect(arrojado.patrimonioNaAposentadoria).toBeGreaterThan(
      conservador.patrimonioNaAposentadoria,
    );
  });

  it('capitalAlvoPerpetuidade = renda * 12 / retornoReal de retirada', () => {
    const r = simulateAposentadoria(baseInputs);
    const realRet = (1 + PERFIS_RETORNO.moderado.retornoRetirada / 100) / (1 + 4 / 100) - 1;
    const expected = (8_000 * 12) / realRet;
    expect(r.capitalAlvoPerpetuidade).toBeCloseTo(expected, 0);
  });

  it('opera em valores reais — inflação 0 produz patrimônio nominal igual ao real', () => {
    const semInflacao = simulateAposentadoria({ ...baseInputs, inflacao: 0 });
    expect(semInflacao.warnings).toEqual([]);
    // Aporte 24k/ano por 30 anos a 12% gera patrimônio ~ aporte * ((1+r)^n - 1) / r ~ 5.79M
    expect(semInflacao.patrimonioNaAposentadoria).toBeGreaterThan(5_000_000);
  });

  it('saldo final coincide entre anos consecutivos (continuidade)', () => {
    const r = simulateAposentadoria(baseInputs);
    for (let i = 1; i < r.anos.length; i++) {
      expect(r.anos[i].patrimonioInicio).toBeCloseTo(r.anos[i - 1].patrimonioFim, 4);
    }
  });

  it('juros = patrimonioInicio * taxa real correspondente à fase', () => {
    const r = simulateAposentadoria(baseInputs);
    const realAcum = (1 + 12 / 100) / (1 + 4 / 100) - 1;
    const ano1 = r.anos[0];
    expect(ano1.juros).toBeCloseTo(ano1.patrimonioInicio * realAcum, 4);
  });

  it('anosDeRenda conta apenas anos da fase de retirada', () => {
    const r = simulateAposentadoria(baseInputs);
    const retiradaAnos = r.anos.filter((a) => a.fase === 'retirada').length;
    expect(r.anosDeRenda).toBe(retiradaAnos);
  });
});
