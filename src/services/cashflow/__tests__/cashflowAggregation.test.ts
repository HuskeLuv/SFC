import { describe, it, expect } from 'vitest';
import { aggregateCashflow } from '../cashflowAggregation';
import type { CashflowGroup } from '@/types/cashflow';

/** Helper para montar item com valores mensais esparsos. */
const item = (
  id: string,
  valuesByMonth: Record<number, number>,
): CashflowGroup['items'][number] => ({
  id,
  userId: null,
  groupId: 'g',
  name: id,
  significado: null,
  rank: null,
  values: Object.entries(valuesByMonth).map(([month, value]) => ({
    id: `${id}-${month}`,
    itemId: id,
    userId: 'u',
    year: 2026,
    month: Number(month),
    value,
  })),
});

const group = (
  id: string,
  type: string,
  name: string,
  items: CashflowGroup['items'],
  children: CashflowGroup[] = [],
): CashflowGroup => ({
  id,
  userId: null,
  name,
  type,
  parentId: null,
  orderIndex: 0,
  items,
  children,
});

function sampleTree(): CashflowGroup[] {
  return [
    group('entradas', 'entrada', 'Entradas', [item('salario', { 0: 5000, 1: 5000 })]),
    group('fixas', 'despesa', 'Despesas Fixas', [item('aluguel', { 0: 2000, 1: 2000 })]),
    group('variaveis', 'despesa', 'Despesas Variáveis', [item('lazer', { 0: 500, 1: 300 })]),
    group('invest', 'investimento', 'Investimentos', [item('aporte', { 0: 1000 })]),
  ];
}

describe('aggregateCashflow', () => {
  it('soma entradas e despesas por mês, excluindo o grupo investimento das despesas', () => {
    const agg = aggregateCashflow(sampleTree());

    expect(agg.entradasByMonth[0]).toBe(5000);
    expect(agg.entradasByMonth[1]).toBe(5000);
    // Despesas = fixas + variáveis (investimento NÃO entra no por-mês)
    expect(agg.despesasByMonth[0]).toBe(2500);
    expect(agg.despesasByMonth[1]).toBe(2300);
  });

  it('calcula totalByMonth (sobra) ignorando o grupo investimento', () => {
    const agg = aggregateCashflow(sampleTree());
    expect(agg.totalByMonth[0]).toBe(2500); // 5000 - 2500
    expect(agg.totalByMonth[1]).toBe(2700); // 5000 - 2300
    expect(agg.totalAnnual).toBe(5200);
  });

  it('preserva o quirk: despesasTotal anual inclui o investimento', () => {
    const agg = aggregateCashflow(sampleTree());
    // fixas(4000) + variáveis(800) + investimento(1000)
    expect(agg.despesasTotal).toBe(5800);
  });

  it('isola a despesa fixa pelo grupo "Despesas Fixas"', () => {
    const agg = aggregateCashflow(sampleTree());
    expect(agg.despesaFixaByMonth[0]).toBe(2000);
    expect(agg.despesaFixaByMonth[1]).toBe(2000);
    expect(agg.despesaFixaAnnual).toBe(4000);
  });

  it('médias usam apenas meses ativos (não dilui por meses futuros vazios)', () => {
    const agg = aggregateCashflow(sampleTree());
    expect(agg.averages.activeMonths).toBe(2);
    expect(agg.averages.sobraMensalMedia).toBe(2600); // (2500+2700)/2
    expect(agg.averages.despesaMensalMedia).toBe(2400); // (2500+2300)/2
    expect(agg.averages.despesaFixaMensal).toBe(2000);
  });

  it('árvore vazia → zeros', () => {
    const agg = aggregateCashflow([]);
    expect(agg.averages).toEqual({
      activeMonths: 0,
      sobraMensalMedia: 0,
      despesaMensalMedia: 0,
      despesaFixaMensal: 0,
    });
    expect(agg.totalAnnual).toBe(0);
  });

  it('agrega subgrupos no grupo pai (groupTotals recursivo)', () => {
    const tree = [
      group(
        'desp',
        'despesa',
        'Despesas',
        [],
        [
          group('fixas', 'despesa', 'Despesas Fixas', [item('aluguel', { 0: 1000 })]),
          group('sub2', 'despesa', 'Outras', [item('x', { 0: 250 })]),
        ],
      ),
      group('entradas', 'entrada', 'Entradas', [item('salario', { 0: 4000 })]),
    ];
    const agg = aggregateCashflow(tree);
    expect(agg.groupAnnualTotals['desp']).toBe(1250);
    expect(agg.despesasByMonth[0]).toBe(1250);
    expect(agg.totalByMonth[0]).toBe(2750); // 4000 - 1250
  });
});
