// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createTestQueryWrapper } from '@/test/wrappers';
import { stubFetch } from '@/test/mocks/fetch';
import {
  AvisoPrecoMedioAgregado,
  AvisoPrecoMedioLinha,
} from '@/components/carteira/PrecoMedioNaoInformado';

const posicoes = [
  { portfolioId: 'p-bbas', ticker: 'BBAS3', nome: 'Banco do Brasil', tipo: 'stock' },
  { portfolioId: 'p-ivvb', ticker: 'IVVB11', nome: 'iShares S&P 500', tipo: 'etf' },
];

afterEach(() => vi.unstubAllGlobals());

describe('avisos de preço médio não informado pelo banco', () => {
  it('linha: só na posição marcada, com link para a compra', async () => {
    stubFetch({ posicoes });
    const Wrapper = createTestQueryWrapper();
    render(
      <Wrapper>
        <AvisoPrecoMedioLinha portfolioId="p-ivvb" />
        <AvisoPrecoMedioLinha portfolioId="p-outra" />
      </Wrapper>,
    );
    const link = await screen.findByRole('link', {
      name: /Preço médio não informado pelo banco — informe/,
    });
    expect(link).toHaveAttribute('href', '/ativos/p-ivvb/editar#movimentacao-inicial');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('agregado: conta as posições e lista os tickers', async () => {
    stubFetch({ posicoes });
    const Wrapper = createTestQueryWrapper();
    render(
      <Wrapper>
        <AvisoPrecoMedioAgregado />
      </Wrapper>,
    );
    expect(
      await screen.findByText('2 posições vieram do banco sem preço médio.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'BBAS3' })).toHaveAttribute(
      'href',
      '/ativos/p-bbas/editar#movimentacao-inicial',
    );
  });

  it('sem posições marcadas ou sem provider: nada', () => {
    const { container } = render(<AvisoPrecoMedioAgregado />);
    expect(container).toBeEmptyDOMElement();
  });
});
