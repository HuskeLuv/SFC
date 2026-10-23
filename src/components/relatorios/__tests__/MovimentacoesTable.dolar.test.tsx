// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => false, useMediaQuery: () => false }));

import MovimentacoesTable, { type Movimentacao } from '../MovimentacoesTable';

const base: Movimentacao = {
  id: 'm1',
  data: '2026-08-10',
  operacao: 'compra',
  ativo: 'Apple',
  tipoAtivo: 'stock',
  categoria: null,
  quantidade: 10,
  total: 5204,
  jaInvestido: false,
};

describe('MovimentacoesTable — moeda por linha', () => {
  it('linha US$ mostra o valor em US$ com o R$ ao lado', () => {
    render(
      <MovimentacoesTable
        movimentacoes={[
          { ...base, moeda: 'USD', totalMoeda: 1000, cotacaoMoeda: 5.2, valorBRL: 5204 },
          { ...base, id: 'm2', ativo: 'Petrobras', total: 502, moeda: 'BRL' },
        ]}
        totalNoPeriodo={2}
      />,
    );
    expect(screen.getByText(/US\$\s*1\.000,00/)).toBeInTheDocument();
    expect(screen.getByText(/≈ R\$\s*5\.204,00/)).toBeInTheDocument();
    expect(screen.getByText(/^R\$\s*502,00$/)).toBeInTheDocument();
  });

  it('linha US$ sem câmbio avisa em vez de mostrar R$', () => {
    render(
      <MovimentacoesTable
        movimentacoes={[{ ...base, total: 0, moeda: 'USD', totalMoeda: 1000, valorBRL: null }]}
        totalNoPeriodo={1}
      />,
    );
    expect(screen.getByText('sem câmbio')).toBeInTheDocument();
  });
});
