import { describe, it, expect } from 'vitest';
import { buildOrcamentoVsReal } from '../orcamentoVsReal';
import type { CashflowGroup } from '@/types/cashflow';

/** Item com valores mensais esparsos; cor opcional por mês (hex ou token). */
const item = (
  id: string,
  valuesByMonth: Record<number, number>,
  colorsByMonth: Record<number, string> = {},
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
    color: colorsByMonth[Number(month)] ?? null,
  })),
});

const group = (
  id: string,
  type: string,
  name: string,
  items: CashflowGroup['items'],
  children: CashflowGroup[] = [],
  templateName?: string,
): CashflowGroup => ({
  id,
  userId: null,
  name,
  type,
  parentId: null,
  orderIndex: 0,
  items,
  children,
  ...(templateName ? { templateName } : {}),
});

/** Árvore no formato do template real: Despesas → Fixas → categorias. */
function sampleTree(): CashflowGroup[] {
  const habitacao = group('habitacao', 'despesa', 'Habitação', [
    item('aluguel', { 0: 2000, 1: 2000 }, { 0: '#FF0000' }),
    item('luz', { 0: 200 }, { 0: 'red' }),
  ]);
  const transporte = group('transporte', 'despesa', 'Transporte', [
    item('combustivel', { 0: 400, 1: 300 }),
  ]);
  const fixas = group('fixas', 'despesa', 'Despesas Fixas', [], [habitacao, transporte]);
  const variaveis = group('variaveis', 'despesa', 'Despesas Variáveis', [
    item('imprevisto', { 0: 100 }, { 0: '#0000FF' }),
  ]);
  const despesas = group('despesas', 'despesa', 'Despesas', [], [fixas, variaveis]);
  const entradas = group('entradas', 'entrada', 'Entradas', [
    item('salario', { 0: 7500, 1: 8000 }, { 0: '#76933C' }),
  ]);
  const invest = group('invest', 'investimento', 'Investimentos', [item('aporte', { 0: 1000 })]);
  const saldo = group('cc', 'saldo', 'Conta Corrente', [item('sobra', { 0: 999 })]);
  return [entradas, despesas, invest, saldo];
}

describe('buildOrcamentoVsReal', () => {
  it('particiona categorias no grão da planilha: filhos de Despesas Fixas + Despesas Variáveis', () => {
    const result = buildOrcamentoVsReal({
      groups: sampleTree(),
      metas: [],
      investimentosRealPorMes: Array(12).fill(0),
    });

    expect(result.categorias.map((c) => c.nome)).toEqual([
      'Habitação',
      'Transporte',
      'Despesas Variáveis',
    ]);
    expect(result.categorias[0].parentNome).toBe('Despesas Fixas');
    expect(result.categorias[2].parentNome).toBe('Despesas');
  });

  it('real lançado soma todas as células; consolidado só as pintadas de Pago/Recebido', () => {
    const result = buildOrcamentoVsReal({
      groups: sampleTree(),
      metas: [],
      investimentosRealPorMes: Array(12).fill(0),
    });

    const habitacao = result.categorias[0];
    // Lançado: aluguel 2000 + luz 200 em jan; 2000 em fev
    expect(habitacao.realPorMes.lancado[0]).toBe(2200);
    expect(habitacao.realPorMes.lancado[1]).toBe(2000);
    // Consolidado: jan tem aluguel (#FF0000) + luz ('red'); fev sem cor
    expect(habitacao.realPorMes.consolidado[0]).toBe(2200);
    expect(habitacao.realPorMes.consolidado[1]).toBe(0);
    expect(habitacao.realAnual).toEqual({ lancado: 4200, consolidado: 2200 });

    // Azul (Lançamento Futuro) NÃO consolida
    const variaveis = result.categorias[2];
    expect(variaveis.realPorMes.lancado[0]).toBe(100);
    expect(variaveis.realPorMes.consolidado[0]).toBe(0);
  });

  it('anexa a meta da categoria e soma o total de metas sem investimentos', () => {
    const result = buildOrcamentoVsReal({
      groups: sampleTree(),
      metas: [
        { groupId: 'habitacao', tipo: 'grupo', tipoMeta: 'valor', valor: 3500 },
        { groupId: 'transporte', tipo: 'grupo', tipoMeta: 'valor', valor: 1000 },
        { groupId: null, tipo: 'investimentos', tipoMeta: 'percentual', valor: 10 },
      ],
      investimentosRealPorMes: Array(12).fill(0),
    });

    expect(result.categorias[0].metaMensal).toBe(3500);
    expect(result.categorias[1].metaMensal).toBe(1000);
    expect(result.categorias[2].metaMensal).toBeNull();
    // Total de metas exclui a linha de investimentos (aporte não é despesa)
    expect(result.totais.metaMensal).toBe(4500);
  });

  it('meta de investimentos = % da renda do mês, por modo', () => {
    const result = buildOrcamentoVsReal({
      groups: sampleTree(),
      metas: [{ groupId: null, tipo: 'investimentos', tipoMeta: 'percentual', valor: 10 }],
      investimentosRealPorMes: [900, ...Array(11).fill(0)],
    });

    expect(result.investimentos.percentual).toBe(10);
    // Renda lançada: jan 7500, fev 8000 → metas 750 / 800
    expect(result.investimentos.metaPorMes.lancado[0]).toBe(750);
    expect(result.investimentos.metaPorMes.lancado[1]).toBe(800);
    // Renda consolidada: só jan está verde → fev meta consolidada = 0
    expect(result.investimentos.metaPorMes.consolidado[0]).toBe(750);
    expect(result.investimentos.metaPorMes.consolidado[1]).toBe(0);
    expect(result.investimentos.realPorMes[0]).toBe(900);
  });

  it('sem meta de investimentos: percentual null e metaPorMes zerada', () => {
    const result = buildOrcamentoVsReal({
      groups: sampleTree(),
      metas: [],
      investimentosRealPorMes: Array(12).fill(0),
    });

    expect(result.investimentos.percentual).toBeNull();
    expect(result.investimentos.metaPorMes.lancado.every((v) => v === 0)).toBe(true);
    // Entradas seguem expostas (base do % na UI de configuração)
    expect(result.investimentos.entradasPorMes.lancado[0]).toBe(7500);
  });

  it('totais de real somam só as categorias (sem investimento, sem saldo)', () => {
    const result = buildOrcamentoVsReal({
      groups: sampleTree(),
      metas: [],
      investimentosRealPorMes: Array(12).fill(0),
    });

    // jan: habitação 2200 + transporte 400 + variáveis 100 (aporte 1000 e
    // conta corrente 999 ficam fora)
    expect(result.totais.realPorMes.lancado[0]).toBe(2700);
    expect(result.totais.realPorMes.consolidado[0]).toBe(2200);
    expect(result.totais.realAnual.lancado).toBe(5000);
  });

  it('grupo de despesa custom na raiz vira categoria própria', () => {
    const tree = sampleTree();
    tree.push(group('pets', 'despesa', 'Pets', [item('racao', { 0: 150 })]));

    const result = buildOrcamentoVsReal({
      groups: tree,
      metas: [{ groupId: 'pets', tipo: 'grupo', tipoMeta: 'valor', valor: 200 }],
      investimentosRealPorMes: Array(12).fill(0),
    });

    const pets = result.categorias.find((c) => c.nome === 'Pets');
    expect(pets).toBeDefined();
    expect(pets?.metaMensal).toBe(200);
    expect(pets?.parentNome).toBeNull();
    expect(result.totais.realPorMes.lancado[0]).toBe(2850);
  });

  it('identifica Despesas Fixas renomeada pelo templateName', () => {
    const habitacao = group('habitacao', 'despesa', 'Habitação', [item('aluguel', { 0: 500 })]);
    const fixasRenomeada = group(
      'fixas',
      'despesa',
      'Contas do Mês',
      [],
      [habitacao],
      'Despesas Fixas',
    );
    const despesas = group('despesas', 'despesa', 'Gastos', [], [fixasRenomeada], 'Despesas');

    const result = buildOrcamentoVsReal({
      groups: [despesas],
      metas: [],
      investimentosRealPorMes: Array(12).fill(0),
    });

    // Ainda desce ao grão das categorias, e o parentNome é o nome EXIBIDO
    expect(result.categorias.map((c) => c.nome)).toEqual(['Habitação']);
    expect(result.categorias[0].parentNome).toBe('Contas do Mês');
  });
});
