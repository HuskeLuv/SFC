// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => true, useMediaQuery: () => true }));

import PosicaoConsolidada, { type PosicaoSecao } from '../../PosicaoConsolidada';
import PosicaoConsolidadaCards from '../PosicaoConsolidadaCards';

// O Testing Library normaliza o espaço fino (NBSP) do texto do nó; o esperado também.
const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ');

const secoes: PosicaoSecao[] = [
  {
    categoria: 'acoes',
    ativos: [
      { portfolioId: 'p1', nome: 'ITSA4', symbol: 'ITSA4', valorAtual: 1_000 },
      { portfolioId: 'p2', nome: 'WEGE3', symbol: 'WEGE3', valorAtual: 3_000 },
    ],
  },
  {
    categoria: 'fiis',
    ativos: [{ portfolioId: 'p3', nome: 'HGLG11', symbol: 'HGLG11', valorAtual: 6_000 }],
  },
];

describe('PosicaoConsolidadaCards', () => {
  it('subtotal e % por categoria, ativos do maior para o menor e total geral', () => {
    render(<PosicaoConsolidadaCards secoes={secoes} totalGeral={10_000} />);
    const [acoes, fiis] = screen.getAllByRole('region');
    expect(within(acoes).getByText(`${brl(4_000)} · 40,0%`)).toBeInTheDocument();
    expect(within(fiis).getByText(`${brl(6_000)} · 60,0%`)).toBeInTheDocument();
    const nomes = within(acoes)
      .getAllByRole('listitem')
      .map((li) => li.firstElementChild!.textContent);
    expect(nomes).toEqual(['WEGE3', 'ITSA4']);
    expect(within(acoes).getByText('30,0%')).toBeInTheDocument();
    expect(screen.getByText('Total Geral')).toBeInTheDocument();
    expect(screen.getByText(`${brl(10_000)} · 100%`)).toBeInTheDocument();
  });

  it('no celular a tabela continua no DOM (imprime) e os cartões são só de tela', () => {
    const { container } = render(<PosicaoConsolidada secoes={secoes} />);
    const cards = container.querySelector('[data-mf-mobile]')!;
    expect(cards.parentElement!.className.split(' ')).toEqual(['hidden', 'mscreen:block']);
    const table = container.querySelector('table')!;
    expect(table.parentElement!.className).toContain('mscreen:hidden');
    // Mesmos números nos dois.
    expect(within(table).getByText(brl(10_000))).toBeInTheDocument();
    expect(within(cards as HTMLElement).getByText(`${brl(10_000)} · 100%`)).toBeInTheDocument();
  });
});
