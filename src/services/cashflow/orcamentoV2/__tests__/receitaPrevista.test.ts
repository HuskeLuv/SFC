import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  cashflowGroup: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import {
  calcularReceitaPrevista,
  entradasLancadas,
  precisaDoAnoAnterior,
  receitaPrevistaPorMes,
} from '../receitaPrevista';
import { arvoreAnexoB, grupo, item, valor } from '@/test/fixtures/orcamentoAnexoBArvore';

const meses = (pares: Record<number, number>): number[] =>
  Array.from({ length: 12 }, (_, m) => pares[m] ?? 0);

describe('calcularReceitaPrevista (P2/Q2)', () => {
  it('mês com entrada no Fluxo → origem fluxo', () => {
    const r = calcularReceitaPrevista(2026, meses({ 9: 24_000 }), null);
    expect(r[9]).toEqual({ valor: 24_000, origem: 'fluxo' });
  });

  it('sem entrada → média dos meses com entrada > 0 entre os 3 anteriores', () => {
    const r = calcularReceitaPrevista(2026, meses({ 2: 3_000, 4: 6_000 }), null);
    expect(r[5]).toEqual({
      valor: 4_500,
      origem: 'media3m',
      mesesBase: [
        { ano: 2026, mes: 3 },
        { ano: 2026, mes: 5 },
      ],
    });
    // Junho: só maio na janela (mar–mai → abr 0, mai 6.000).
    expect(r[6]).toEqual({ valor: 6_000, origem: 'media3m', mesesBase: [{ ano: 2026, mes: 5 }] });
  });

  it('a janela é de 3 meses: entrada mais antiga não entra', () => {
    const r = calcularReceitaPrevista(2026, meses({ 1: 5_000 }), null);
    expect(r[5]).toEqual({ valor: null, origem: 'nenhuma' });
  });

  it('cruza o ano: janeiro e fevereiro usam out–dez do ano anterior', () => {
    const anterior = meses({ 9: 3_000, 11: 6_000 });
    const r = calcularReceitaPrevista(2026, meses({}), anterior);
    expect(r[0]).toEqual({
      valor: 4_500,
      origem: 'media3m',
      mesesBase: [
        { ano: 2025, mes: 10 },
        { ano: 2025, mes: 12 },
      ],
    });
    expect(r[1]).toEqual({ valor: 6_000, origem: 'media3m', mesesBase: [{ ano: 2025, mes: 12 }] });
    expect(r[3]).toEqual({ valor: null, origem: 'nenhuma' });
  });

  it('janela mista entre os dois anos', () => {
    const r = calcularReceitaPrevista(2026, meses({ 0: 9_000 }), meses({ 10: 3_000 }));
    expect(r[2]).toEqual({
      valor: 9_000,
      origem: 'media3m',
      mesesBase: [{ ano: 2026, mes: 1 }],
    });
    expect(r[1].mesesBase).toEqual([
      { ano: 2025, mes: 11 },
      { ano: 2026, mes: 1 },
    ]);
    expect(r[1].valor).toBe(6_000);
  });

  it('sem receita em lugar nenhum → nulls', () => {
    const r = calcularReceitaPrevista(2026, meses({}), meses({}));
    expect(r.every((m) => m.valor === null && m.origem === 'nenhuma')).toBe(true);
  });

  it('precisaDoAnoAnterior só quando jan–mar tem mês sem entrada', () => {
    expect(precisaDoAnoAnterior(meses({ 0: 1, 1: 1, 2: 1 }))).toBe(false);
    expect(precisaDoAnoAnterior(meses({ 0: 1, 2: 1 }))).toBe(true);
  });
});

describe('entradasLancadas', () => {
  it('soma toda célula de Entradas no Lançado (inclusive previstas não pintadas); despesas fora', () => {
    const arvore = arvoreAnexoB({ 9: 20_000 });
    const entradasFixas = arvore[0].children[0];
    entradasFixas.items.push(
      item('it-bonus', entradasFixas.id, 'Bônus', { values: [valor('it-bonus', 9, 4_000, null)] }),
    );
    expect(entradasLancadas(arvore)[9]).toBe(24_000);
  });
});

describe('receitaPrevistaPorMes', () => {
  beforeEach(() => mockPrisma.cashflowGroup.findMany.mockReset());

  it('jan–mar com entrada → não monta a árvore do ano anterior', async () => {
    const arvore = arvoreAnexoB({ 0: 1_000, 1: 1_000, 2: 1_000 });
    const r = await receitaPrevistaPorMes('u1', 2026, arvore);
    expect(r[0]).toEqual({ valor: 1_000, origem: 'fluxo' });
    expect(mockPrisma.cashflowGroup.findMany).not.toHaveBeenCalled();
  });

  it('janeiro vazio → média pela ÁRVORE MESCLADA do ano anterior; seção oculta não conta', async () => {
    // Ano anterior: Entradas Fixas com 6.000 em dez; Entradas Variáveis com 99.999 em dez, mas
    // oculta pelo usuário (override hidden) — SQL cru contaria, a árvore não.
    const tplFixas = grupo('t-fixas', 'Entradas Fixas', 'entrada', {
      userId: null,
      templateId: null,
      items: [
        item('t-salario', 't-fixas', 'Salário', {
          userId: null,
          values: [{ ...valor('t-salario', 11, 6_000), year: 2025 }],
        }),
      ],
    });
    const tplVariaveis = grupo('t-var', 'Entradas Variáveis', 'entrada', {
      userId: null,
      templateId: null,
      items: [
        item('t-bonus', 't-var', 'Bônus', {
          userId: null,
          values: [{ ...valor('t-bonus', 11, 99_999), year: 2025 }],
        }),
      ],
    });
    const templates = [
      grupo('t-ent', 'Entradas', 'entrada', {
        userId: null,
        templateId: null,
        children: [tplFixas, tplVariaveis],
      }),
    ];
    const customizations = [
      grupo('u-ent', 'Entradas', 'entrada', {
        templateId: 't-ent',
        children: [
          grupo('u-var', 'Entradas Variáveis', 'entrada', { templateId: 't-var', hidden: true }),
        ],
      }),
    ];
    mockPrisma.cashflowGroup.findMany.mockImplementation(
      async (args?: { where?: { userId?: string | null } }) =>
        args?.where?.userId === null ? templates : customizations,
    );

    const arvore = arvoreAnexoB({ 5: 10_000 });
    const r = await receitaPrevistaPorMes('u1', 2026, arvore);

    expect(mockPrisma.cashflowGroup.findMany).toHaveBeenCalled();
    const where =
      mockPrisma.cashflowGroup.findMany.mock.calls[0][0].include.items.include.values.where;
    expect(where).toEqual({ userId: 'u1', year: 2025 });
    expect(r[0]).toEqual({ valor: 6_000, origem: 'media3m', mesesBase: [{ ano: 2025, mes: 12 }] });
    expect(r[5]).toEqual({ valor: 10_000, origem: 'fluxo' });
  });
});
