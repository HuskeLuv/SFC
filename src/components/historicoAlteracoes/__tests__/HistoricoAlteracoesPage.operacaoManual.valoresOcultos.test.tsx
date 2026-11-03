// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { HistoricoAlteracaoEntry } from '@/hooks/useHistoricoAlteracoes';
import {
  ComValoresOcultos,
  expectPilulas,
  expectSemValoresExpostos,
  textosExpostos,
} from '@/test/valoresOcultos';

/**
 * Esconder valores (Fase 6): a operação de um ativo manual como ela é gravada de verdade. O nome
 * do ativo leva o valor aplicado ("CDB X - R$ 1.000 - 13/10/2026") e o campo Observações guarda o
 * JSON técnico da operação (quantity, price, total…). Com o olho fechado nada disso pode sobrar:
 * nem no título (linha, cartão, sheet e confirm do Desfazer), nem nas Observações dos Detalhes. A
 * quantidade curta ("1") usa a pílula justa, que nunca passa da largura do número (decisão 6).
 */

const mocks = vi.hoisted(() => ({
  historico: {
    entries: [] as HistoricoAlteracaoEntry[],
    pagination: { totalPages: 1 } as null | { totalPages: number },
    loading: false,
    error: null as string | null,
    refetch: vi.fn(),
  },
  belowLg: false,
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/historico-alteracoes' }));
vi.mock('@/hooks/useHistoricoAlteracoes', () => ({
  useHistoricoAlteracoes: () => mocks.historico,
}));
vi.mock('@/hooks/useUndoAlteracao', () => ({
  useUndoAlteracao: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ success: true }),
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

const PRECO = 7654.32;
const NOME = 'CDB Banco Teste - R$ 7.654 - 13/10/2026';
const NOTES = JSON.stringify({
  name: NOME,
  quantity: 3,
  price: PRECO,
  total: 22962.96,
  fees: 0,
});

const ENTRY: HistoricoAlteracaoEntry = {
  id: 'log-op',
  userId: 'u1',
  actorId: 'u1',
  viaConsultant: false,
  undoneAt: null,
  revertsId: null,
  section: 'carteira',
  action: 'operacao.registrar',
  entity: 'stock-transaction',
  entityId: 't1',
  entityLabel: NOME,
  changes: [
    { field: 'type', label: 'Tipo', before: null, after: 'compra' },
    { field: 'quantity', label: 'Quantidade', before: null, after: 1, format: 'number' },
    { field: 'price', label: 'Preço', before: null, after: PRECO, format: 'currency' },
    { field: 'notes', label: 'Observações', before: null, after: NOTES },
  ],
  createdAt: '2026-10-30T14:49:00.000Z',
  canUndo: true,
};

beforeEach(() => {
  mocks.historico.entries = [ENTRY];
});

const renderPagina = (ocultos: boolean) =>
  render(
    <ComValoresOcultos ocultos={ocultos}>
      <HistoricoAlteracoesPage />
    </ComValoresOcultos>,
  );

const SENTINELAS = [PRECO, 22962.96];

describe.each([
  ['desktop', false],
  ['celular', true],
] as const)('operação de ativo manual com o olho fechado — %s', (_nome, belowLg) => {
  beforeEach(() => {
    mocks.belowLg = belowLg;
  });

  it('título, resumo e Observações sem valor; nome e data do ativo ficam', () => {
    const { container } = renderPagina(true);
    fireEvent.click(screen.getAllByRole('button', { name: 'Detalhes' })[0]);
    expect(screen.getAllByText('Observações:').length).toBeGreaterThan(0);
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS });
    const visivel = textosExpostos(container).join('\n');
    expect(visivel).not.toContain('"price"');
    expect(visivel).not.toContain('7654');
    expect(container.textContent).toContain('Registrou operação de CDB Banco Teste');
    expect(container.textContent).toContain('13/10/2026');
    // Quantidade curta: pílula justa (nunca mais larga que o número).
    expect(container.querySelectorAll('.mf-sensivel--justa').length).toBeGreaterThan(0);
  });
});

describe('Desfazer de operação de ativo manual com o olho fechado', () => {
  it('celular: o título do sheet esconde o valor do nome', async () => {
    mocks.belowLg = true;
    const { container } = renderPagina(true);
    const card = container.querySelector('[data-historico-card]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Desfazer' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Registrou operação de CDB Banco Teste');
    expectSemValoresExpostos(dialog, { sentinelas: SENTINELAS });
    expectPilulas(dialog);
  });

  it('desktop: o confirm do navegador mascara o valor do nome', () => {
    mocks.belowLg = false;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPagina(true);
    fireEvent.click(screen.getAllByRole('button', { name: 'Desfazer' })[0]);
    expect(confirm).toHaveBeenCalledTimes(1);
    const msg = confirm.mock.calls[0][0] as string;
    expect(msg).toContain('CDB Banco Teste - R$ •••••');
    expect(msg).not.toContain('7.654');
    confirm.mockRestore();
  });
});

describe('operação de ativo manual com o olho aberto', () => {
  it('título e Observações exatamente como hoje, sem pílula', () => {
    mocks.belowLg = false;
    const { container } = renderPagina(false);
    fireEvent.click(screen.getAllByRole('button', { name: 'Detalhes' })[0]);
    expectPilulas(container, 0);
    expect(container.textContent).toContain(`Registrou operação de ${NOME}`);
    expect(container.textContent).toContain(NOTES);
  });
});
