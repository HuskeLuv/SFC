// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { HistoricoAlteracaoEntry } from '@/hooks/useHistoricoAlteracoes';
import {
  ComValoresOcultos,
  expectPilulas,
  expectSemValoresExpostos,
  representacoesDoSentinela,
} from '@/test/valoresOcultos';

/**
 * Esconder valores (Fase 6, fatia 1): Histórico de alterações com o olho fechado. Antes/depois em
 * dinheiro ('currency') e quantidade ('number') viram pílula no resumo, nos Detalhes e no sheet do
 * Desfazer; percentual, data, texto, nomes e a data da alteração continuam. O Desfazer manda só o
 * id. Olho aberto: o mesmo texto de hoje (renderRichDescription) e nenhuma pílula.
 */

const mocks = vi.hoisted(() => ({
  historico: {
    entries: [] as HistoricoAlteracaoEntry[],
    pagination: { totalPages: 1 } as null | { totalPages: number },
    loading: false,
    error: null as string | null,
    refetch: vi.fn(),
  },
  mutateAsync: vi.fn(),
  belowLg: false,
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/historico-alteracoes' }));
vi.mock('@/hooks/useHistoricoAlteracoes', () => ({
  useHistoricoAlteracoes: () => mocks.historico,
}));
vi.mock('@/hooks/useUndoAlteracao', () => ({
  useUndoAlteracao: () => ({
    mutateAsync: mocks.mutateAsync,
    mutate: vi.fn(),
    isPending: false,
    variables: undefined,
  }),
}));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => mocks.belowLg,
  useMediaQuery: () => mocks.belowLg,
}));

import HistoricoAlteracoesPage from '../HistoricoAlteracoesPage';
import { renderRichDescription } from '../renderChange';

const S = {
  quantidadeAntes: 1371.25,
  quantidadeDepois: 1429.75,
  precoAntes: 98.76,
  precoDepois: 103.21,
  totalAntes: 12345.67,
  totalDepois: 13579.24,
} as const;

const base = {
  userId: 'u1',
  actorId: 'u1',
  viaConsultant: false,
  undoneAt: null,
  revertsId: null,
};

const ENTRIES: HistoricoAlteracaoEntry[] = [
  {
    ...base,
    id: 'log-ativo',
    section: 'carteira',
    action: 'ativo.editar',
    entity: 'portfolio',
    entityId: 'p1',
    entityLabel: 'PETR4',
    changes: [
      {
        field: 'quantity',
        label: 'Quantidade',
        before: S.quantidadeAntes,
        after: S.quantidadeDepois,
        format: 'number',
      },
      {
        field: 'avgPrice',
        label: 'Preço médio',
        before: S.precoAntes,
        after: S.precoDepois,
        format: 'currency',
      },
      {
        field: 'totalInvested',
        label: 'Total investido',
        before: S.totalAntes,
        after: S.totalDepois,
        format: 'currency',
      },
    ],
    createdAt: '2026-10-20T14:30:00.000Z',
    canUndo: true,
  },
  {
    ...base,
    id: 'log-divida',
    section: 'dividas',
    action: 'divida.editar',
    entity: 'divida',
    entityId: 'd1',
    entityLabel: 'Financiamento',
    changes: [
      { field: 'taxaJuros', label: 'Taxa de juros', before: 0.89, after: 0.79, format: 'percent' },
      {
        field: 'inicio',
        label: 'Início',
        before: '2050-01-01',
        after: '2052-06-01',
        format: 'date',
      },
    ],
    createdAt: '2026-10-12T09:00:00.000Z',
    canUndo: false,
  },
];

const SENTINELAS = Object.values(S);

beforeEach(() => {
  mocks.historico.entries = ENTRIES;
  mocks.mutateAsync.mockReset();
  mocks.mutateAsync.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const renderPagina = (ocultos: boolean) =>
  render(
    <ComValoresOcultos ocultos={ocultos}>
      <HistoricoAlteracoesPage />
    </ComValoresOcultos>,
  );

/** Abre os Detalhes da 1ª alteração (a do ativo, com os 3 campos). */
const abrirDetalhesDoAtivo = (escopo: HTMLElement) => {
  fireEvent.click(within(escopo).getAllByRole('button', { name: 'Detalhes' })[0]);
};

describe.each([
  ['desktop', false],
  ['celular', true],
] as const)('Histórico com o olho fechado — %s', (_nome, belowLg) => {
  beforeEach(() => {
    mocks.belowLg = belowLg;
  });

  it('resumo e Detalhes sem dinheiro nem quantidade; %, datas e nomes ficam', () => {
    const { container } = renderPagina(true);
    const lista = container.querySelector('[data-historico-lista]') as HTMLElement;
    const escopo = (
      belowLg ? lista.querySelector('[data-mf-mobile]') : lista.querySelector('.lg\\:block')
    ) as HTMLElement;
    fireEvent.click(within(escopo).getAllByRole('button', { name: 'Detalhes' })[0]);
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS });
    expectPilulas(container);
    // Quantidade = pílula curta; dinheiro = pílula normal (as duas guardam a largura do valor).
    expect(container.querySelectorAll('.mf-sensivel--curto').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.mf-sensivel--reserva').length).toBe(
      container.querySelectorAll('.mf-sensivel').length,
    );
    expect(container.textContent).toContain('0,89%');
    expect(container.textContent).toContain('01/01/2050');
    expect(container.textContent).toContain('Editou o ativo PETR4');
    expect(container.textContent).toContain('Preço médio:');
  });
});

describe('Histórico — olho fechado no detalhe expandido do desktop', () => {
  beforeEach(() => {
    mocks.belowLg = false;
  });

  it('a lista completa (3 campos) também esconde', () => {
    const { container } = renderPagina(true);
    abrirDetalhesDoAtivo(container);
    expect(screen.getAllByText('Total investido:').length).toBeGreaterThan(0);
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS });
  });
});

describe('Histórico — sheet do Desfazer (celular)', () => {
  beforeEach(() => {
    mocks.belowLg = true;
  });

  it('"volta para" com pílula e o Desfazer manda só o id', async () => {
    const { container } = renderPagina(true);
    const card = container.querySelector('[data-historico-card]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Desfazer' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Preço médio volta para');
    expectSemValoresExpostos(dialog, { sentinelas: SENTINELAS });
    expectPilulas(dialog, 3);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Desfazer' }));
    });
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.mutateAsync).toHaveBeenCalledWith('log-ativo');
  });
});

describe('Histórico com o olho aberto', () => {
  it.each([
    ['desktop', false],
    ['celular', true],
  ] as const)('%s: o resumo é o texto de hoje e não há pílula', (_nome, belowLg) => {
    mocks.belowLg = belowLg;
    const { container } = renderPagina(false);
    abrirDetalhesDoAtivo(container);
    expectPilulas(container, 0);
    const { summary } = renderRichDescription(ENTRIES[0]);
    expect(summary).toContain('R$');
    expect(container.textContent).toContain(summary as string);
    for (const n of SENTINELAS) {
      expect(
        representacoesDoSentinela(n).some((f) => container.textContent?.includes(f)),
        `sentinela ${n} deveria aparecer`,
      ).toBe(true);
    }
  });
});
