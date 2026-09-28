// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { HistoricoAlteracaoEntry } from '@/hooks/useHistoricoAlteracoes';

const mocks = vi.hoisted(() => ({
  historico: {
    entries: [] as HistoricoAlteracaoEntry[],
    pagination: null as null | { totalPages: number },
    loading: false,
    error: null as string | null,
    refetch: vi.fn(),
  },
  mutateAsync: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock('@/hooks/useHistoricoAlteracoes', () => ({
  useHistoricoAlteracoes: () => mocks.historico,
}));

vi.mock('@/hooks/useUndoAlteracao', () => ({
  useUndoAlteracao: () => ({
    mutateAsync: mocks.mutateAsync,
    mutate: mocks.mutate,
    isPending: false,
    variables: undefined,
  }),
}));

import HistoricoAlteracoesPage from '../HistoricoAlteracoesPage';
import { renderRichDescription } from '../renderChange';

function stubMatchMedia(mobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: mobile,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  });
}

const ENTRY: HistoricoAlteracaoEntry = {
  id: 'log-1',
  userId: 'u1',
  actorId: 'u1',
  viaConsultant: true,
  section: 'calendario',
  action: 'evento.criar',
  entity: 'evento',
  entityId: 'ev-1',
  entityLabel: 'Consulta médica',
  changes: [
    { field: 'titulo', label: 'Título', before: null, after: 'Consulta médica', format: 'text' },
  ],
  createdAt: '2026-09-26T12:00:00.000Z',
  canUndo: true,
  undoneAt: null,
  revertsId: null,
};

beforeEach(() => {
  mocks.historico.entries = [ENTRY];
  mocks.historico.pagination = { totalPages: 1 };
  mocks.historico.loading = false;
  mocks.historico.error = null;
  mocks.historico.refetch = vi.fn();
  mocks.mutateAsync.mockReset();
  mocks.mutate.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error — remove o stub
  delete window.matchMedia;
});

/** O Desfazer do cartão (celular) ou da linha (desktop) — o primeiro visível no DOM do jsdom. */
const undoButtons = () => screen.getAllByRole('button', { name: 'Desfazer' });

describe('HistoricoAlteracoesPage — celular', () => {
  beforeEach(() => stubMatchMedia(true));

  it('cartões marcados como ramo mobile, chips como filtro e selo "via consultor"', () => {
    const { container } = render(<HistoricoAlteracoesPage />);
    expect(container.querySelector('[data-historico-lista]')).not.toBeNull();
    const cards = container.querySelector('[data-mf-mobile].lg\\:hidden');
    expect(cards).not.toBeNull();
    expect(within(cards as HTMLElement).getByText('via consultor')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Todas' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('Detalhes mostra o antes → depois só ao tocar', () => {
    const { container } = render(<HistoricoAlteracoesPage />);
    const card = container.querySelector('[data-historico-card]') as HTMLElement;
    expect(within(card).queryByText('Título:')).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Detalhes' }));
    expect(within(card).getByText('Título:')).toBeTruthy();
  });

  it('Desfazer abre o sheet; Cancelar não chama a mutação', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const { container } = render(<HistoricoAlteracoesPage />);
    const card = container.querySelector('[data-historico-card]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Desfazer' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Desfazer esta alteração?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('erro (409) aparece dentro do sheet com "Tentar de novo"; sucesso mostra o aviso', async () => {
    mocks.mutateAsync
      .mockRejectedValueOnce(new Error('O item foi alterado depois desta mudança.'))
      .mockResolvedValueOnce({ success: true, section: 'calendario' });
    const { container } = render(<HistoricoAlteracoesPage />);
    const card = container.querySelector('[data-historico-card]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Desfazer' }));
    const dialog = await screen.findByRole('alertdialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Desfazer' }));
    });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'O item foi alterado depois desta mudança.',
    );
    // O banner do desktop não aparece.
    expect(screen.queryByText(/Não foi possível desfazer:/)).toBeNull();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Tentar de novo' }));
    });
    expect(mocks.mutateAsync).toHaveBeenCalledTimes(2);
    expect(mocks.mutateAsync).toHaveBeenCalledWith('log-1');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(await screen.findByText('Alteração desfeita')).toBeTruthy();
  });

  it('erro ao carregar: estado de erro com "Tentar de novo" (refetch)', () => {
    mocks.historico.entries = [];
    mocks.historico.error = 'Erro ao buscar histórico de alterações';
    render(<HistoricoAlteracoesPage />);
    expect(screen.getByText('Não carregou o histórico')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(mocks.historico.refetch).toHaveBeenCalledTimes(1);
  });
});

describe('HistoricoAlteracoesPage — desktop', () => {
  beforeEach(() => stubMatchMedia(false));

  it('window.confirm com a string EXATA de hoje; recusar não chama a mutação', async () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<HistoricoAlteracoesPage />);
    await act(async () => {
      fireEvent.click(undoButtons()[0]);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      `Desfazer esta alteração?\n\n${renderRichDescription(ENTRY).title}`,
    );
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('erro segue no banner role=alert de hoje', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.mutateAsync.mockRejectedValueOnce(new Error('conflito'));
    render(<HistoricoAlteracoesPage />);
    await act(async () => {
      fireEvent.click(undoButtons()[0]);
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível desfazer: conflito',
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
