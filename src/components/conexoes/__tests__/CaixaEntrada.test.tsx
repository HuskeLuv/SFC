// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PendenteDTO } from '@/hooks/useConexoesBancarias';

// Objetos estáveis entre renders (o componente reage a `data` num useEffect).
const mocks = vi.hoisted(() => ({
  aplicar: vi.fn(),
  caixa: { data: null as unknown },
  linhas: {
    data: [{ itemId: 'item-super', rotulo: 'Habitação › Supermercado', tipo: 'despesa' }],
  },
}));

vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => false }));
vi.mock('@/hooks/useConexoesBancarias', () => ({
  useCaixaEntrada: () => mocks.caixa,
  useLinhasFluxo: () => mocks.linhas,
  useAplicarTransacoes: () => ({ mutateAsync: mocks.aplicar, isPending: false }),
  useIgnorarTransacoes: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import CaixaEntrada, { mensagemLancamento } from '../CaixaEntrada';

const pendente = (
  id: string,
  description: string,
  date: string,
  itemId: string | null,
): PendenteDTO =>
  ({
    id,
    accountId: 'conta',
    contaNome: 'gold',
    date,
    description,
    merchantName: null,
    amount: -50,
    type: 'DEBIT',
    providerCategory: itemId ? 'Groceries' : 'Shopping',
    sugestao: itemId
      ? { tipo: 'linha', itemId, rotulo: 'Habitação › Supermercado' }
      : { tipo: 'nenhuma', itemId: null, rotulo: null },
  }) as unknown as PendenteDTO;

describe('mensagemLancamento', () => {
  it('diz o mês do fluxo em que as transações entraram', () => {
    expect(
      mensagemLancamento(2, [{ date: '2026-09-06T12:00:00Z' }, { date: '2026-09-07T12:00:00Z' }]),
    ).toBe(
      '2 transações lançadas no fluxo de caixa em set/2026. O valor entra no mês da data da compra.',
    );
  });

  it('vários meses: em ordem, com a quantidade de cada', () => {
    expect(
      mensagemLancamento(3, [
        { date: '2026-10-01T12:00:00Z' },
        { date: '2026-09-06T12:00:00Z' },
        { date: '2026-09-07T12:00:00Z' },
      ]),
    ).toBe(
      '3 transações lançadas no fluxo de caixa em set/2026 (2), out/2026 (1). O valor entra no mês da data da compra.',
    );
  });

  it('avisa as marcadas que ficaram sem lançar', () => {
    expect(mensagemLancamento(1, [{ date: '2026-09-06T12:00:00Z' }], 2)).toBe(
      '1 transação lançada no fluxo de caixa em set/2026. O valor entra no mês da data da compra. 2 marcadas ficaram sem lançar porque não têm linha escolhida: escolha a linha e lance de novo.',
    );
  });
});

describe('CaixaEntrada — Lançar marcadas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const pendentes = [
      pendente('t1', 'MERCADO X', '2026-09-06T12:00:00Z', 'item-super'),
      pendente('t2', 'LOJA Y', '2026-09-08T12:00:00Z', null),
    ];
    mocks.caixa = {
      data: { pendentes, total: pendentes.length, page: 1, totalPages: 1 },
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
    } as typeof mocks.caixa;
    mocks.aplicar.mockResolvedValue({ aplicadas: 1, celulas: [], ids: ['t1'] });
  });

  it('lança só as que têm linha, avisa e mantém marcada a que ficou sem linha', async () => {
    const onAviso = vi.fn();
    render(<CaixaEntrada onAviso={onAviso} />);

    fireEvent.click(screen.getByLabelText('Marcar MERCADO X'));
    fireEvent.click(screen.getByLabelText('Marcar LOJA Y'));
    fireEvent.click(screen.getByRole('button', { name: 'Lançar marcadas' }));

    await waitFor(() => expect(onAviso).toHaveBeenCalled());
    expect(mocks.aplicar).toHaveBeenCalledWith({
      aplicacoes: [{ id: 't1', itemId: 'item-super' }],
    });
    expect(onAviso).toHaveBeenCalledWith(
      '1 transação lançada no fluxo de caixa em set/2026. O valor entra no mês da data da compra. 1 marcada ficou sem lançar porque não tem linha escolhida: escolha a linha e lance de novo.',
    );
    expect(screen.getByLabelText('Marcar LOJA Y')).toBeChecked();
    expect(screen.getByLabelText('Marcar MERCADO X')).not.toBeChecked();
    expect(screen.getByText('1 marcada(s)')).toBeInTheDocument();
  });
});
