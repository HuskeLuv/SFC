import { describe, it, expect } from 'vitest';
import { projetarComecotas, type FundoPosicao } from '../comecotasIR';

const pos = (
  overrides: Partial<FundoPosicao> & Pick<FundoPosicao, 'symbol' | 'nome'>,
): FundoPosicao => ({
  valorAplicado: 1000,
  valorAtualizado: 1100,
  startDate: new Date('2024-01-15'),
  ...overrides,
});

describe('projetarComecotas — calendário', () => {
  it('em janeiro/abril, próxima cobrança é 31 de maio do mesmo ano', () => {
    const result = projetarComecotas(
      [pos({ symbol: 'XPCT', nome: 'XP CT' })],
      new Date('2025-04-15'),
    );
    expect(result.proximaCobrancaGlobal).toContain('2025-05-31');
  });

  it('em junho/outubro, próxima é 30 de novembro do mesmo ano', () => {
    const result = projetarComecotas(
      [pos({ symbol: 'XPCT', nome: 'XP CT' })],
      new Date('2025-08-15'),
    );
    expect(result.proximaCobrancaGlobal).toContain('2025-11-30');
  });

  it('depois de novembro, próxima é 31 de maio do ano seguinte', () => {
    const result = projetarComecotas(
      [pos({ symbol: 'XPCT', nome: 'XP CT' })],
      new Date('2025-12-10'),
    );
    expect(result.proximaCobrancaGlobal).toContain('2026-05-31');
  });

  it('lista vazia não retorna data', () => {
    const result = projetarComecotas([], new Date('2025-04-15'));
    expect(result.proximaCobrancaGlobal).toBeNull();
    expect(result.fundos).toEqual([]);
  });
});

describe('projetarComecotas — alíquotas', () => {
  it('longo prazo (default): 15% sobre rendimento', () => {
    const result = projetarComecotas(
      [pos({ symbol: 'X', nome: 'X', valorAplicado: 1000, valorAtualizado: 1500 })],
      new Date('2025-04-15'),
    );
    expect(result.fundos[0].aliquota).toBe(0.15);
    expect(result.fundos[0].rendimentoEstimado).toBe(500);
    expect(result.fundos[0].irEstimado).toBe(75);
  });

  it('curto prazo: 20%', () => {
    const result = projetarComecotas(
      [
        pos({
          symbol: 'X',
          nome: 'X',
          valorAplicado: 1000,
          valorAtualizado: 1500,
          tipo: 'curto-prazo',
        }),
      ],
      new Date('2025-04-15'),
    );
    expect(result.fundos[0].aliquota).toBe(0.2);
    expect(result.fundos[0].irEstimado).toBe(100);
  });

  it('fundo de ações: isento de come-cotas, ir=0', () => {
    const result = projetarComecotas(
      [pos({ symbol: 'X', nome: 'X', valorAplicado: 1000, valorAtualizado: 5000, tipo: 'acoes' })],
      new Date('2025-04-15'),
    );
    expect(result.fundos[0].aliquota).toBe(0);
    expect(result.fundos[0].irEstimado).toBe(0);
    expect(result.fundos[0].isentoComeCotas).toBe(true);
  });
});

describe('projetarComecotas — agregado', () => {
  it('totalProximaCobranca soma só fundos não isentos', () => {
    const result = projetarComecotas(
      [
        pos({ symbol: 'A', nome: 'LP', valorAplicado: 1000, valorAtualizado: 1300 }), // 45 IR
        pos({
          symbol: 'B',
          nome: 'CP',
          valorAplicado: 2000,
          valorAtualizado: 2500,
          tipo: 'curto-prazo',
        }), // 100 IR
        pos({
          symbol: 'C',
          nome: 'FIA',
          valorAplicado: 1000,
          valorAtualizado: 5000,
          tipo: 'acoes',
        }), // 0
      ],
      new Date('2025-04-15'),
    );
    expect(result.totalProximaCobranca).toBe(145);
  });

  it('rendimento negativo (prejuízo) zera IR mesmo sem isenção', () => {
    const result = projetarComecotas(
      [pos({ symbol: 'X', nome: 'X', valorAplicado: 1000, valorAtualizado: 800 })],
      new Date('2025-04-15'),
    );
    expect(result.fundos[0].rendimentoEstimado).toBe(0); // clamped to 0
    expect(result.fundos[0].irEstimado).toBe(0);
  });
});
