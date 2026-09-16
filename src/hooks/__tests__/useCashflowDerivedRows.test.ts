// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import type { CashflowGroup } from '@/types/cashflow';
import type { ProventoData } from '@/hooks/useProventos';
import { useCashflowDerivedRows } from '../useCashflowDerivedRows';

const months = (...vals: number[]): number[] => [...vals, ...Array(12 - vals.length).fill(0)];

const group = (overrides: Partial<CashflowGroup>): CashflowGroup => ({
  id: 'g',
  userId: 'u1',
  name: 'Grupo',
  type: 'despesa',
  parentId: null,
  orderIndex: 0,
  items: [],
  children: [],
  ...overrides,
});

const groups: CashflowGroup[] = [
  group({ id: 'entradas', name: 'Entradas', type: 'entrada' }),
  group({
    id: 'despesas',
    name: 'Despesas',
    type: 'despesa',
    children: [
      group({
        id: 'fixas',
        name: 'Despesas Fixas',
        canonicalName: 'Despesas Fixas',
        type: 'despesa',
        parentId: 'despesas',
      }),
    ],
  }),
  group({ id: 'inv', name: 'Investimentos', type: 'investimento' }),
  group({ id: 'cc', name: 'Conta Corrente', type: 'saldo' }),
];

const processedData = {
  groups,
  groupTotals: {
    fixas: months(300, 300),
    inv: months(100, 50),
    cc: months(20, 30, 40),
  },
  groupAnnualTotals: { fixas: 600 },
  entradasByMonth: months(1000, 1000),
  despesasByMonth: months(400, 500),
};

const provento = (overrides: Partial<ProventoData>): ProventoData => ({
  id: 'p',
  data: '2026-01-01T00:00:00.000Z',
  symbol: 'XPML11',
  ativo: 'XPML11',
  tipo: 'rendimento',
  valor: 10,
  quantidade: 1,
  valorUnitario: 10,
  status: 'realizado',
  ...overrides,
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('conta-corrente-anterior')) {
        return mockFetchResponse({ saldoDezembroAnterior: 500 });
      }
      if (url.includes('evolucao-patrimonio')) {
        return mockFetchResponse({
          baseAplicadaAnterior: 1000,
          snapshots: [{ month: 0, valor: 7777 }],
        });
      }
      throw new Error(`fetch inesperado: ${url}`);
    }),
  );
});

describe('useCashflowDerivedRows', () => {
  it('Rendimentos Recebidos: só realizados do ano, mês em UTC', () => {
    const { result } = renderHookWithClient(() =>
      useCashflowDerivedRows({
        processedData,
        currentYear: 2026,
        proventos: [
          provento({ id: '1', data: '2026-01-01T00:00:00.000Z', valor: 10 }),
          // dia 1º à meia-noite UTC continua em março (getMonth local jogaria pra fev)
          provento({ id: '2', data: '2026-03-01T00:00:00.000Z', valor: 25 }),
          provento({ id: '3', data: '2026-01-15T00:00:00.000Z', valor: 99, status: 'a_receber' }),
          provento({ id: '4', data: '2025-01-15T00:00:00.000Z', valor: 99 }),
        ],
      }),
    );
    expect(result.current.proventosByMonth).toEqual(months(10, 0, 25));
    expect(result.current.proventosAnnual).toBe(35);
    expect(result.current.despesasFixasData).toEqual({ byMonth: months(300, 300), annual: 600 });
    expect(result.current.contaCorrenteGroup?.id).toBe('cc');
  });

  it('Saldo C/C anterior, Fluxo livre e Evolução após as queries chegarem', async () => {
    const { result } = renderHookWithClient(() =>
      useCashflowDerivedRows({
        processedData,
        currentYear: 2026,
        proventos: [],
        planejamentoPorMes: months(0, 7),
        reinvestimentosPorMes: months(0, 3),
      }),
    );

    await waitFor(() => expect(result.current.saldoContaCorrenteAnteriorByMonth[0]).toBe(500));

    // jan = dez do ano anterior; fev+ = Conta Corrente do mês anterior
    expect(result.current.saldoContaCorrenteAnteriorByMonth.slice(0, 4)).toEqual([500, 20, 30, 40]);

    // Fluxo livre = (entradas − despesas) + saldo C/C anterior − aportes
    // jan: (1000−400) + 500 − 100 = 1000 · fev: (1000−500) + 20 − 50 = 470
    expect(result.current.fluxoCaixaLivreByMonth.slice(0, 2)).toEqual([1000, 470]);
    expect(result.current.fluxoCaixaLivreAnnual).toBe(
      result.current.fluxoCaixaLivreByMonth.reduce((s, v) => s + v, 0),
    );

    await waitFor(() => expect(result.current.evolucaoPatrimonioByMonth[0]).toBe(7777));
    // fev encadeia: anterior + aportes CHEIOS (50 + 7 sonho + 3 reinvest.) +
    // (fluxo livre − carry da Conta Corrente) = 7777 + 60 + (470 − 20)
    expect(result.current.evolucaoPatrimonioByMonth[1]).toBe(7777 + 60 + 450);
  });
});
