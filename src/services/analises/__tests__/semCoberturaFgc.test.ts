import { describe, expect, it } from 'vitest';
import { resumirSemCobertura } from '../semCoberturaFgc';

describe('resumirSemCobertura', () => {
  it('agrupa por classe, ordena por valor e soma a renda fixa sem proteção', () => {
    const r = resumirSemCobertura(
      [
        { classe: 'acoes', valorAtual: 10_000 },
        { classe: 'acoes', valorAtual: 5_000 },
        { classe: 'tesouroDireto', valorAtual: 20_000 },
        { classe: 'moedasCriptos', valorAtual: 1_000 },
      ],
      // 300 mil de RF numa instituição: 250 mil cobertos, 50 mil acima do limite
      { totalValor: 300_000, totalEfetivamenteCoberto: 250_000 },
    );
    expect(r.classes.map((c) => [c.classe, c.valor, c.quantidadeAtivos])).toEqual([
      ['tesouroDireto', 20_000, 1],
      ['acoes', 15_000, 2],
      ['moedasCriptos', 1_000, 1],
    ]);
    expect(r.classes[0].nota).toContain('Tesouro Nacional');
    expect(r.classes[1].nota).toBeNull();
    expect(r.total).toBe(36_000);
    expect(r.totalInvestimentos).toBe(336_000);
    expect(r.totalSemProtecao).toBe(86_000);
    expect(r.percentualSemProtecao).toBe(25.6);
  });

  it('ignora valores zerados e não divide por zero', () => {
    const r = resumirSemCobertura([{ classe: 'fiis', valorAtual: 0 }], {
      totalValor: 0,
      totalEfetivamenteCoberto: 0,
    });
    expect(r.classes).toEqual([]);
    expect(r.percentualSemProtecao).toBe(0);
  });
});
