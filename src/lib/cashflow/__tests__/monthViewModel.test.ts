import { describe, expect, it } from 'vitest';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import { aggregateCashflow } from '@/services/cashflow/cashflowAggregation';
import {
  allGroupIds,
  buildMonthBlocks,
  defaultMonth,
  groupPathToItem,
  isGroupEmptyInMonth,
  monthStatus,
  monthSummaries,
  type MonthDerived,
  type MonthDerivedSeries,
  type MonthGroup,
  type MonthProcessedData,
} from '../monthViewModel';

const YEAR = 2026;

function item(
  id: string,
  groupId: string,
  values: number[],
  extra: Partial<CashflowItem> & {
    cells?: Record<number, { color?: string; comment?: string; formula?: string }>;
  } = {},
): CashflowItem {
  const { cells = {}, ...rest } = extra;
  return {
    id,
    userId: 'u1',
    groupId,
    name: id,
    significado: null,
    rank: null,
    values: values.map((value, month) => ({
      id: `${id}-${month}`,
      itemId: id,
      userId: 'u1',
      year: YEAR,
      month,
      value,
      ...cells[month],
    })),
    ...rest,
  };
}

function group(
  id: string,
  name: string,
  type: string,
  parentId: string | null,
  items: CashflowItem[] = [],
  children: CashflowGroup[] = [],
): CashflowGroup {
  return { id, userId: 'u1', name, type, parentId, orderIndex: 0, items, children };
}

const m12 = (fill: (m: number) => number) => Array.from({ length: 12 }, (_, m) => fill(m));

function fixture() {
  const salario = item(
    'Salário',
    'ef',
    m12(() => 10000),
    {
      cells: { 3: { color: '#76933C', comment: 'ok' } },
    },
  );
  const freela = item(
    'Freela',
    'ev',
    m12((m) => (m === 3 ? 500 : 0)),
  );
  const aluguel = item(
    'Aluguel',
    'hab',
    m12(() => 3000),
    {
      cells: { 3: { color: 'red', formula: '=1500+1500' } },
    },
  );
  const luz = item(
    'Luz',
    'hab',
    m12(() => 0),
  );
  const mercado = item(
    'Supermercado',
    'dv',
    m12((m) => 1000 + m * 10),
    { objetivoId: null },
  );
  const parcela = item(
    'Parcela carro',
    'dv',
    m12(() => 800),
    { dividaId: 'd1' },
  );
  const itau = item(
    'Itaú',
    'cc',
    m12((m) => 2000 + m),
  );
  const aporte = item(
    'investimento-acoes',
    'inv',
    m12((m) => (m === 3 ? 1500 : 0)),
  );
  aporte.name = 'Ações';

  const groups: CashflowGroup[] = [
    group(
      'ent',
      'Entradas',
      'entrada',
      null,
      [],
      [
        group('ef', 'Entradas Fixas', 'entrada', 'ent', [salario]),
        group('ev', 'Entradas Variáveis', 'entrada', 'ent', [freela]),
      ],
    ),
    group(
      'desp',
      'Despesas',
      'despesa',
      null,
      [],
      [
        group(
          'df',
          'Despesas Fixas',
          'despesa',
          'desp',
          [],
          [group('hab', 'Habitação', 'despesa', 'df', [aluguel, luz])],
        ),
        group('dv', 'Despesas Variáveis', 'despesa', 'desp', [mercado, parcela]),
      ],
    ),
    group('cc', 'Conta Corrente', 'saldo', null, [itau]),
    group('inv', 'Investimentos', 'investimento', null, [aporte]),
  ];
  const processedData: MonthProcessedData = { groups, ...aggregateCashflow(groups) };
  const derived: MonthDerivedSeries = {
    saldoContaCorrenteAnteriorByMonth: m12((m) => (m === 0 ? 1500 : 2000 + m - 1)),
    fluxoCaixaLivreByMonth: m12((m) => 100 * m),
    evolucaoPatrimonioByMonth: m12((m) => (m > 9 ? null : 50000 + m)),
    proventosByMonth: m12((m) => (m === 3 ? 300 : 0)),
    despesasFixasData: { byMonth: processedData.despesaFixaByMonth, annual: 0 },
    contaCorrenteGroup: groups[2],
  };
  return { groups, processedData, derived };
}

const labels = (blocks: ReturnType<typeof buildMonthBlocks>) =>
  blocks.map((b) => (b.kind === 'group' ? `G:${b.label}` : `D:${b.key}`));

describe('buildMonthBlocks', () => {
  it('segue a ordem do DataTableTwo', () => {
    const { processedData, derived } = fixture();
    const blocks = buildMonthBlocks({ processedData, derived, month: 3, year: YEAR });
    expect(labels(blocks)).toEqual([
      'G:Total de Entradas',
      'D:saldoCcAnterior',
      'G:Despesas Fixas e Variáveis',
      'D:saldoMes',
      'D:poupanca',
      'G:Conta Corrente',
      'G:Aporte/Resgate',
      'D:fluxoLivre',
      'D:evolucao',
      'D:rendimentos',
      'D:paz',
    ]);
    const despesas = blocks[2] as MonthGroup;
    expect(despesas.afterBand.map((d) => d.key)).toEqual(['inflacao']);
    expect(despesas.children.map((c) => c.label)).toEqual(['Despesas Fixas', 'Despesas Variáveis']);
    expect(despesas.children[0].children[0].level).toBe(3);
    expect(despesas.level).toBe(1);
    expect(despesas.children[1].level).toBe(2);
  });

  it('valores do mês 3 (abril) iguais à coluna do desktop', () => {
    const { processedData, derived } = fixture();
    const blocks = buildMonthBlocks({ processedData, derived, month: 3, year: YEAR });
    const entradas = blocks[0] as MonthGroup;
    const despesas = blocks[2] as MonthGroup;
    expect(entradas.monthSubtotal).toBe(10500);
    expect(entradas.annual).toBe(120500);
    // 3000 aluguel + 1030 mercado + 800 parcela
    expect(despesas.monthSubtotal).toBe(4830);
    expect(despesas.percent).toBeCloseTo((4830 / 10500) * 100);

    const d = (key: string) => blocks.find((b) => b.kind === 'derived' && b.key === key)!;
    expect((d('saldoMes') as MonthDerived).value).toBe(10500 - 4830);
    expect((d('saldoMes') as MonthDerived).emphasis).toBe(true);
    expect((d('poupanca') as MonthDerived).value).toBeCloseTo(((10500 - 4830) / 10500) * 100);
    expect((d('poupanca') as MonthDerived).format).toBe('percent');
    // inflação: 4830 / 4820 (março) − 1
    expect(despesas.afterBand[0].value).toBeCloseTo((4830 / 4820 - 1) * 100);
    expect((d('saldoCcAnterior') as MonthDerived).value).toBe(2002);
    expect((d('fluxoLivre') as MonthDerived).value).toBe(300);
    expect((d('evolucao') as MonthDerived).value).toBe(50003);
    expect((d('rendimentos') as MonthDerived).value).toBe(300);
    // paz: proventos ÷ despesas fixas (3000)
    expect((d('paz') as MonthDerived).value).toBeCloseTo(10);
  });

  it('linhas: situação normalizada, comentário, fórmula, selos e capacidades', () => {
    const { processedData, derived } = fixture();
    const blocks = buildMonthBlocks({ processedData, derived, month: 3, year: YEAR });
    const entradas = blocks[0] as MonthGroup;
    const salario = entradas.children[0].items[0];
    expect(salario).toMatchObject({
      itemId: 'Salário',
      groupId: 'ef',
      monthValue: 10000,
      annual: 120000,
      colorKey: 'green',
      colorLabel: 'Recebido',
      hasComment: true,
      hasFormula: false,
      readOnly: false,
    });
    const despesas = blocks[2] as MonthGroup;
    const aluguel = despesas.children[0].children[0].items[0];
    expect(aluguel).toMatchObject({ colorKey: 'red', colorLabel: 'Pago', hasFormula: true });
    const parcela = despesas.children[1].items[1];
    expect(parcela.badges).toEqual(['divida']);
    expect(parcela.caps.canDelete).toBe(false);

    const inv = blocks.find((b) => b.kind === 'group' && b.groupType === 'investimento')!;
    expect(inv.kind === 'group' && inv.readOnly).toBe(true);
    expect(inv.kind === 'group' && inv.items[0].readOnly).toBe(true);
  });

  it('índices sem base viram null', () => {
    const { processedData, derived } = fixture();
    const blocks = buildMonthBlocks({ processedData, derived, month: 11, year: YEAR });
    const evol = blocks.find((b) => b.kind === 'derived' && b.key === 'evolucao') as MonthDerived;
    expect(evol.value).toBeNull();
    const paz = blocks.find((b) => b.kind === 'derived' && b.key === 'paz') as MonthDerived;
    expect(paz.value).toBe(0);
  });

  it('isGroupEmptyInMonth olha os subgrupos', () => {
    const { processedData, derived } = fixture();
    const blocks = buildMonthBlocks({ processedData, derived, month: 5, year: YEAR });
    const entradas = blocks[0] as MonthGroup;
    expect(isGroupEmptyInMonth(entradas.children[1])).toBe(true);
    expect(isGroupEmptyInMonth(entradas)).toBe(false);
  });
});

describe('helpers do mês', () => {
  const now = new Date(2026, 8, 26, 12);

  it('monthStatus', () => {
    expect(monthStatus(2026, 7, now)).toBe('fechado');
    expect(monthStatus(2026, 8, now)).toBe('atual');
    expect(monthStatus(2026, 9, now)).toBe('previsto');
    expect(monthStatus(2025, 11, now)).toBe('fechado');
    expect(monthStatus(2027, 0, now)).toBe('previsto');
  });

  it('monthSummaries: saldo do mês e previsto depois do mês atual', () => {
    const { processedData } = fixture();
    const s = monthSummaries(processedData, 2026, now);
    expect(s).toHaveLength(12);
    expect(s[3].saldo).toBe(processedData.totalByMonth[3]);
    expect(s.map((x) => x.previsto)).toEqual(m12((m) => m > 8));
    expect(monthSummaries(processedData, 2025, now).every((x) => !x.previsto)).toBe(true);
  });

  it('defaultMonth: atual / dezembro no passado / janeiro no futuro', () => {
    expect(defaultMonth(2026, now)).toBe(8);
    expect(defaultMonth(2025, now)).toBe(11);
    expect(defaultMonth(2027, now)).toBe(0);
  });

  it('allGroupIds e groupPathToItem', () => {
    const { groups } = fixture();
    expect(allGroupIds(groups)).toEqual([
      'ent',
      'ef',
      'ev',
      'desp',
      'df',
      'hab',
      'dv',
      'cc',
      'inv',
    ]);
    expect(groupPathToItem(groups, 'Aluguel')).toEqual(['desp', 'df', 'hab']);
    expect(groupPathToItem(groups, 'nada')).toEqual([]);
  });
});
