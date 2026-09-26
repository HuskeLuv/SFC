// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => true, useMediaQuery: () => true }));

import MovimentacoesTable, { type Movimentacao } from '../../MovimentacoesTable';
import MovimentacoesCards from '../MovimentacoesCards';

const mov = (i: number, operacao = 'compra'): Movimentacao => ({
  id: `m${i}`,
  data: `2026-09-${String(10 + i).padStart(2, '0')}`,
  operacao,
  ativo: `ATIVO${i}`,
  tipoAtivo: 'acao',
  quantidade: 1,
  total: 100 * i,
  jaInvestido: false,
});

describe('MovimentacoesCards', () => {
  it('mostra 5 e "Ver as n" abre todas', () => {
    const lista = Array.from({ length: 8 }, (_, i) => mov(i + 1, i === 1 ? 'venda' : 'compra'));
    const { container } = render(<MovimentacoesCards movimentacoes={lista} totalNoPeriodo={8} />);
    expect(container.querySelectorAll('[data-mf-card]')).toHaveLength(5);
    expect(screen.getByText('11/09/2026 · Compra')).toBeInTheDocument();
    expect(screen.getByText('12/09/2026 · Venda')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver as 8' }));
    expect(container.querySelectorAll('[data-mf-card]')).toHaveLength(8);
    expect(screen.queryByRole('button', { name: /Ver as/ })).toBeNull();
    expect(screen.getByText('8 movimentações no período.')).toBeInTheDocument();
  });

  it('até 5: sem "Ver as"; período maior que a lista avisa quantas são', () => {
    render(<MovimentacoesCards movimentacoes={[mov(1), mov(2)]} totalNoPeriodo={40} />);
    expect(screen.queryByRole('button', { name: /Ver as/ })).toBeNull();
    expect(
      screen.getByText('Exibindo as 2 movimentações mais recentes de 40 no período.'),
    ).toBeInTheDocument();
  });

  it('a tabela (que imprime) continua com TODAS as linhas', () => {
    const lista = Array.from({ length: 8 }, (_, i) => mov(i + 1));
    const { container } = render(<MovimentacoesTable movimentacoes={lista} totalNoPeriodo={8} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(8);
    expect(container.querySelectorAll('[data-mf-card]')).toHaveLength(5);
  });
});
