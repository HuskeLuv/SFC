// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import { aggregateCashflow } from '@/services/cashflow/cashflowAggregation';
import { emitCashflowFlash } from '@/lib/cashflow/cashflowEvents';

const mocks = vi.hoisted(() => ({
  editSheets: vi.fn(),
  yearGrid: vi.fn(),
  toggleCollapse: vi.fn(),
  setCollapsedAll: vi.fn(),
  setYear: vi.fn(),
  collapsed: {} as Record<string, boolean>,
  view: null as unknown,
}));

vi.mock('@/context/CashflowYearContext', () => ({
  useCashflowYear: () => ({ year: 2026, setYear: mocks.setYear }),
}));
vi.mock('@/hooks/useCashflowView', () => ({ useCashflowView: () => mocks.view }));
vi.mock('@/hooks/useCashflowMutations', () => ({
  useCashflowMutations: () => ({ reorderItem: vi.fn().mockResolvedValue(true) }),
}));
vi.mock('../CashflowEditSheets', () => ({
  default: (props: unknown) => {
    mocks.editSheets(props);
    return null;
  },
}));
vi.mock('../CashflowYearGridSheet', () => ({
  default: (props: unknown) => {
    mocks.yearGrid(props);
    return null;
  },
}));
vi.mock('@/components/cashflow/ImportPlanilhaModal', () => ({ ImportPlanilhaModal: () => null }));

import CashflowMonthView from '../CashflowMonthView';

const YEAR = 2026;
const m12 = (f: (m: number) => number) => Array.from({ length: 12 }, (_, m) => f(m));

function item(
  id: string,
  groupId: string,
  values: number[],
  cells: Record<number, { color?: string; comment?: string }> = {},
): CashflowItem {
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

function buildView() {
  const groups: CashflowGroup[] = [
    group(
      'ent',
      'Entradas',
      'entrada',
      null,
      [],
      [
        group('ef', 'Entradas Fixas', 'entrada', 'ent', [
          item(
            'Salário',
            'ef',
            m12(() => 10000),
          ),
        ]),
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
          [
            group('hab', 'Habitação', 'despesa', 'df', [
              item(
                'Aluguel',
                'hab',
                m12(() => 3000),
                { 3: { color: '#FF0000' } },
              ),
              item(
                'Luz',
                'hab',
                m12(() => 0),
              ),
            ]),
          ],
        ),
        group('dv', 'Despesas Variáveis', 'despesa', 'desp', [
          item(
            'Supermercado',
            'dv',
            m12((m) => 1000 + m * 10),
          ),
        ]),
      ],
    ),
  ];
  const processedData = { groups, ...aggregateCashflow(groups) };
  return {
    data: groups,
    loading: false,
    error: null,
    refetch: vi.fn(),
    processedData,
    derived: {
      saldoContaCorrenteAnteriorByMonth: m12(() => 0),
      fluxoCaixaLivreByMonth: m12(() => 0),
      evolucaoPatrimonioByMonth: m12(() => 0),
      proventosByMonth: m12(() => 0),
      despesasFixasData: { byMonth: processedData.despesaFixaByMonth, annual: 0 },
      contaCorrenteGroup: null,
      investimentosByMonth: m12(() => 0),
      proventosAnnual: 0,
      fluxoCaixaLivreAnnual: 0,
    },
    collapsible: {
      collapsed: mocks.collapsed,
      toggleCollapse: mocks.toggleCollapse,
      setCollapsedAll: mocks.setCollapsedAll,
    },
  };
}

const label = () => document.querySelector('[data-mf-month-label]') as HTMLElement;
const row = (name: string) =>
  document.querySelector(`[data-mf-fluxo-row][data-item-id="${name}"]`) as HTMLElement | null;
const lastTarget = () => {
  const calls = mocks.editSheets.mock.calls;
  return (calls[calls.length - 1][0] as { target: unknown }).target;
};

describe('CashflowMonthView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 26, 12));
    window.history.replaceState(null, '', '/fluxodecaixa?mes=4');
    mocks.collapsed = {};
    mocks.view = buildView();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('abre no ?mes= e marca data-mf-fluxo-ready', () => {
    render(<CashflowMonthView />);
    expect(label()).toHaveTextContent('Abril de 2026');
    expect(document.querySelector('[data-mf-fluxo-ready]')).not.toBeNull();
  });

  it('trocar o mês muda os valores e grava ?mes=', () => {
    render(<CashflowMonthView />);
    expect(row('Supermercado')).toHaveTextContent('1.030,00');
    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(label()).toHaveTextContent('Maio de 2026');
    expect(row('Supermercado')).toHaveTextContent('1.040,00');
    expect(window.location.search).toContain('mes=5');
  });

  it('tocar na linha pede o sheet da célula', () => {
    render(<CashflowMonthView />);
    fireEvent.click(row('Supermercado')!);
    expect(lastTarget()).toEqual({ kind: 'cell', itemId: 'Supermercado', groupId: 'dv', month: 3 });
  });

  it('situação = ponto com o nome da legenda; o valor não é pintado', () => {
    render(<CashflowMonthView />);
    const aluguel = row('Aluguel')!;
    const dot = within(aluguel).getByRole('img', { name: 'Pago' });
    expect(dot).toHaveStyle({ backgroundColor: '#FF0000' });
    const valueEls = Array.from(aluguel.querySelectorAll('span')).filter((el) =>
      el.textContent?.includes('3.000,00'),
    );
    for (const el of valueEls) expect(el.style.color).toBe('');
  });

  it('linhas sem valor ficam atrás de "Mostrar N linhas sem valor"', () => {
    render(<CashflowMonthView />);
    expect(row('Luz')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar 1 linha sem valor' }));
    expect(row('Luz')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Esconder linhas sem valor' })).toBeInTheDocument();
  });

  it('recolher usa o estado compartilhado com o desktop', () => {
    render(<CashflowMonthView />);
    fireEvent.click(
      document.querySelector('[data-mf-fluxo-band="1"][data-group-id="desp"]') as HTMLElement,
    );
    expect(mocks.toggleCollapse).toHaveBeenCalledWith('desp');
  });

  it('grupo recolhido esconde as linhas', () => {
    mocks.collapsed = { desp: true };
    mocks.view = buildView();
    render(<CashflowMonthView />);
    expect(row('Supermercado')).toBeNull();
    expect(row('Salário')).not.toBeNull();
  });

  it('o flash do lançamento muda o mês e abre o caminho', () => {
    mocks.collapsed = { hab: true };
    mocks.view = buildView();
    render(<CashflowMonthView />);
    act(() => emitCashflowFlash({ itemId: 'Aluguel', year: 2026, month: 5 }));
    expect(label()).toHaveTextContent('Junho de 2026');
    expect(mocks.setCollapsedAll).toHaveBeenCalledWith({});
  });

  it('flash de outro ano é ignorado', () => {
    render(<CashflowMonthView />);
    act(() => emitCashflowFlash({ itemId: 'Aluguel', year: 2025, month: 5 }));
    expect(label()).toHaveTextContent('Abril de 2026');
  });

  it('linha calculada abre a explicação da conta', () => {
    render(<CashflowMonthView />);
    fireEvent.click(document.querySelector('[data-mf-fluxo-derived="saldoMes"]') as HTMLElement);
    expect(
      screen.getByRole('dialog', { name: 'Saldo do mês (Lucro Líquido)' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Total de Entradas − Despesas Fixas e Variáveis/)).toBeInTheDocument();
  });

  it('erro mostra role=alert e Tentar de novo chama o refetch', () => {
    mocks.view = { ...buildView(), error: 'falhou', data: [] };
    render(<CashflowMonthView />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o fluxo');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect((mocks.view as { refetch: ReturnType<typeof vi.fn> }).refetch).toHaveBeenCalled();
    expect(document.querySelector('[data-mf-fluxo-ready]')).toBeNull();
  });
});
