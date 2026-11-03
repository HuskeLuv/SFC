import { describe, it, expect } from 'vitest';
import {
  simularIrpfAnual,
  impostoPelaTabela,
  redutorAnual,
  regrasIrpfDoAno,
  REGRAS_IRPF_2026,
  type EntradaIrpfAnual,
} from '../irpfAnual';

const VAZIA: EntradaIrpfAnual = {
  rendaTributavel: 0,
  inss: 0,
  aportesPgbl: 0,
  dependentes: 0,
  saude: 0,
  educacao: 0,
  pensaoJudicial: 0,
  livroCaixa: 0,
  doacoesIncentivadas: 0,
  irRetido: 0,
};

// Exemplo do HTML do Pedro (03/11/2026): todos os números da tela batem com a regra.
const EXEMPLO_PEDRO: EntradaIrpfAnual = {
  rendaTributavel: 186400,
  inss: 10934.2,
  aportesPgbl: 14200,
  dependentes: 2,
  saude: 6800,
  educacao: 3561.5,
  pensaoJudicial: 0,
  livroCaixa: 0,
  doacoesIncentivadas: 500,
  irRetido: 31280,
};

describe('tabela progressiva anual 2026', () => {
  it('isento até R$ 29.145,60 e 27,5% com parcela de R$ 10.904,76 no topo', () => {
    expect(impostoPelaTabela(29145.6, REGRAS_IRPF_2026)).toBe(0);
    expect(impostoPelaTabela(146354.14, REGRAS_IRPF_2026)).toBe(29342.63);
    expect(impostoPelaTabela(40000, REGRAS_IRPF_2026)).toBe(1270.08);
  });

  it('só 2026 tem regra cadastrada', () => {
    expect(regrasIrpfDoAno(2026)).toBe(REGRAS_IRPF_2026);
    expect(regrasIrpfDoAno(2025)).toBeNull();
  });
});

describe('redutor da Lei 15.270/2025', () => {
  it('até R$ 60 mil reduz até R$ 2.694,15 (limitado ao imposto)', () => {
    expect(redutorAnual(50000, 1270.08, REGRAS_IRPF_2026)).toBe(1270.08);
    expect(redutorAnual(60000, 5000, REGRAS_IRPF_2026)).toBe(2694.15);
  });

  it('entre R$ 60 mil e R$ 88,2 mil decresce linearmente; acima, zero', () => {
    expect(redutorAnual(70000, 4495.24, REGRAS_IRPF_2026)).toBe(1739.48);
    expect(redutorAnual(88200, 9000, REGRAS_IRPF_2026)).toBeCloseTo(0.01, 2);
    expect(redutorAnual(100000, 9000, REGRAS_IRPF_2026)).toBe(0);
  });

  it('entra na simulação: renda de R$ 50 mil no simplificado fica sem imposto', () => {
    const r = simularIrpfAnual({ ...VAZIA, rendaTributavel: 50000 });
    expect(r.simplificado.irDevido).toBe(0);
    expect(r.avisos.redutorAplicado).toBe(true);
  });
});

describe('simularIrpfAnual — exemplo do HTML', () => {
  const r = simularIrpfAnual(EXEMPLO_PEDRO);

  it('modelo completo', () => {
    expect(r.deducoesCompleto.total).toBe(40045.86);
    expect(r.deducoesCompleto.dependentes).toBe(4550.16);
    expect(r.completo.baseCalculo).toBe(146354.14);
    expect(r.completo.impostoTabela).toBe(29342.63);
    expect(r.completo.doacoes).toBe(500);
    expect(r.completo.irDevido).toBe(28842.63);
    expect(r.completo.aliquotaMarginal).toBe(0.275);
  });

  it('modelo simplificado (20% com teto de R$ 16.754,34, sem doações)', () => {
    expect(r.descontoSimplificado).toBe(16754.34);
    expect(r.simplificado.baseCalculo).toBe(169645.66);
    expect(r.simplificado.irDevido).toBe(35747.8);
    expect(r.simplificado.doacoes).toBe(0);
  });

  it('melhor modelo, economia e restituição', () => {
    expect(r.melhorModelo).toBe('completo');
    expect(r.economiaCompletoVsSimplificado).toBe(6905.17);
    expect(r.saldoAjuste).toBe(2437.37);
    expect(r.limiteDoacoes).toBe(1760.56);
  });

  it('PGBL: limite de 12%, economia atual, potencial e adicional', () => {
    expect(r.pgbl.limiteDedutivel).toBe(22368);
    expect(r.pgbl.espacoRestante).toBe(8168);
    expect(r.pgbl.percentualUsado).toBeCloseTo(0.6348, 3);
    expect(r.pgbl.economiaAtual).toBe(3905);
    expect(r.pgbl.economiaPotencial).toBe(6151.2);
    expect(r.pgbl.economiaAdicional).toBe(2246.2);
  });
});

describe('simularIrpfAnual — regras do PGBL', () => {
  it('sem INSS não deduz PGBL', () => {
    const r = simularIrpfAnual({ ...EXEMPLO_PEDRO, inss: 0 });
    expect(r.pgbl.elegivel).toBe(false);
    expect(r.deducoesCompleto.pgbl).toBe(0);
    expect(r.pgbl.economiaAtual).toBe(0);
    expect(r.pgbl.economiaPotencial).toBe(0);
  });

  it('aporte acima de 12% só deduz até o limite', () => {
    const r = simularIrpfAnual({ ...EXEMPLO_PEDRO, aportesPgbl: 30000 });
    expect(r.deducoesCompleto.pgbl).toBe(22368);
    expect(r.pgbl.excedente).toBe(7632);
    expect(r.pgbl.espacoRestante).toBe(0);
    expect(r.pgbl.percentualUsado).toBe(1);
  });

  it('no simplificado o PGBL não economiza nada', () => {
    const r = simularIrpfAnual({
      ...VAZIA,
      rendaTributavel: 120000,
      inss: 5000,
      aportesPgbl: 2000,
    });
    expect(r.melhorModelo).toBe('simplificado');
    expect(r.pgbl.economiaAtual).toBe(0);
    // Completar os 12% (R$ 14.400): INSS + PGBL = R$ 19.400 > desconto simplificado → completo.
    expect(r.pgbl.economiaPotencial).toBeGreaterThan(0);
  });

  it('educação limitada a R$ 3.561,50 por pessoa (titular + dependentes)', () => {
    const r = simularIrpfAnual({
      ...VAZIA,
      rendaTributavel: 100000,
      dependentes: 1,
      educacao: 10000,
    });
    expect(r.deducoesCompleto.educacao).toBe(7123);
  });

  it('avisa IRPFM a partir de R$ 600 mil', () => {
    expect(simularIrpfAnual({ ...VAZIA, rendaTributavel: 650000 }).avisos.irpfmPossivel).toBe(true);
    expect(simularIrpfAnual({ ...VAZIA, rendaTributavel: 100000 }).avisos.irpfmPossivel).toBe(
      false,
    );
  });

  it('entrada vazia não quebra', () => {
    const r = simularIrpfAnual(VAZIA);
    expect(r.irDevido).toBe(0);
    expect(r.pgbl.limiteDedutivel).toBe(0);
    expect(r.pgbl.percentualUsado).toBe(0);
  });
});
