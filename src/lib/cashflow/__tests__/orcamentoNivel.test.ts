import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('@/services/cashflow/getCashflowTree', () => ({ getMergedCashflowGroups: vi.fn() }));
import { nivelOrcamento, rankDoConsumo } from '../orcamentoNivel';
import { rankDoConsumo as rankDoAlerta } from '@/services/cashflow/orcamentoAlertas';

describe('rankDoConsumo (movido do orcamentoAlertas)', () => {
  it('mantém os cortes do alerta', () => {
    expect(rankDoConsumo(3375, 4220)).toBe(0); // 79,97%
    expect(rankDoConsumo(3376, 4220)).toBe(1); // 80% exato (com a tolerância)
    expect(rankDoConsumo(3420, 4220)).toBe(1);
    expect(rankDoConsumo(4220, 4220)).toBe(2);
    expect(rankDoConsumo(4219.996, 4220)).toBe(2);
    expect(rankDoConsumo(4220.01, 4220)).toBe(3);
    expect(rankDoConsumo(100, 0)).toBe(0);
  });

  it('o serviço de alertas re-exporta a mesma função', () => {
    expect(rankDoAlerta).toBe(rankDoConsumo);
  });
});

describe('nivelOrcamento', () => {
  it('sem meta', () => {
    expect(nivelOrcamento(100, null)).toEqual({ pct: null, status: 'sem-meta', texto: 'Sem meta' });
    expect(nivelOrcamento(100, 0).status).toBe('sem-meta');
  });

  it('abaixo de 80% = Dentro da meta', () => {
    expect(nivelOrcamento(79, 100)).toEqual({ pct: 79, status: 'dentro', texto: 'Dentro da meta' });
    expect(nivelOrcamento(0, 100).status).toBe('dentro');
  });

  it('80% exato já é Atenção', () => {
    expect(nivelOrcamento(80, 100)).toEqual({
      pct: 80,
      status: 'atencao',
      texto: 'Atenção: 80% usado',
    });
    expect(nivelOrcamento(99.5, 100).status).toBe('atencao');
  });

  it('100% = Meta atingida', () => {
    expect(nivelOrcamento(100, 100)).toEqual({
      pct: 100,
      status: 'atingido',
      texto: 'Meta atingida',
    });
  });

  it('acima de 100% = Estourou, com o excesso em R$', () => {
    const n = nivelOrcamento(1250, 1000);
    expect(n.status).toBe('estourou');
    expect(n.pct).toBe(125);
    expect(n.texto).toMatch(/^Estourou R\$\s250,00$/);
  });

  it('Investimentos: lógica invertida', () => {
    expect(nivelOrcamento(2500, 2500, true)).toEqual({
      pct: 100,
      status: 'atingido',
      texto: 'Meta de aporte atingida',
    });
    expect(nivelOrcamento(3000, 2500, true).status).toBe('atingido');
    const abaixo = nivelOrcamento(1000, 2500, true);
    expect(abaixo.status).toBe('atencao');
    expect(abaixo.texto).toMatch(/^Faltam R\$\s1\.500,00$/);
    expect(nivelOrcamento(0, null, true).status).toBe('sem-meta');
  });
});
