// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DividaDTO } from '@/hooks/useDividas';
import DividasTable from '../../DividasTable';
import DividasCards from '../DividasCards';

function divida(over: Partial<DividaDTO> & { id: string; nome: string }): DividaDTO {
  return {
    instituicao: null,
    tipo: 'emprestimo_pessoal',
    modalidade: 'financiamento',
    principal: 12000,
    taxaAm: 0.015,
    taxaUnidadeEntrada: 'am',
    prazoMeses: 12,
    sistema: 'PRICE',
    indexador: 'PREFIXADO',
    primeiroVencimento: '2026-01',
    diaVencimento: 10,
    saldoInicial: null,
    dataSaldoInicial: null,
    status: 'ativa',
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    resumo: {
      saldoDevedor: 10000,
      parcelasPagas: 3,
      totalParcelas: 12,
      proximaParcela: {
        numero: 4,
        mes: '2026-04',
        parcela: 1100,
        juros: 150,
        amortizacao: 950,
        saldoDevedor: 9050,
      },
      prazoRestanteMeses: 9,
      categoria: 'c',
    },
    ...over,
  };
}

const CARA = divida({ id: 'a', nome: 'Cara', taxaAm: 0.05 });
const BARATA = divida({ id: 'b', nome: 'Barata', taxaAm: 0.01 });
const INDEXADA = divida({
  id: 'c',
  nome: 'Indexada',
  indexador: 'IPCA',
  taxaAm: 0.02,
  resumo: { ...CARA.resumo!, saldoDevedor: 10000, saldoCorrigido: 11234.5 },
});
const QUITADA = divida({ id: 'q', nome: 'Quitada', status: 'quitada', taxaAm: 0.09 });

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const nomes = () =>
  screen
    .getAllByRole('button')
    .filter((b) => b.hasAttribute('data-mf-card'))
    .map((b) => b.querySelector('.truncate')?.textContent);

describe('DividasCards', () => {
  it('mostra o saldo corrigido quando a dívida é indexada', () => {
    render(
      <DividasCards
        dividas={[INDEXADA]}
        totalDevido={11234.5}
        totalParcelas={1100}
        cetSort={null}
        onCycleCetSort={() => {}}
        onSelectDivida={() => {}}
      />,
    );
    const card = screen.getByRole('button', { name: /Indexada/ });
    expect(within(card).getByText('R$ 11.234,50')).toBeInTheDocument();
    expect(within(card).queryByText('R$ 10.000,00')).toBeNull();
  });

  it('situação em ponto + palavra, sem verde (nem na concluída)', () => {
    const { container } = render(
      <DividasCards
        dividas={[CARA, QUITADA]}
        totalDevido={10000}
        totalParcelas={1100}
        cetSort={null}
        onCycleCetSort={() => {}}
        onSelectDivida={() => {}}
      />,
    );
    expect(screen.getByText('Iniciada')).toBeInTheDocument();
    expect(screen.getByText('Concluída')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/green|emerald|success/);
  });

  it('concluídas vão para o fim e o total em aberto aparece no rodapé', () => {
    render(
      <DividasCards
        dividas={[QUITADA, CARA]}
        totalDevido={10000}
        totalParcelas={1100}
        cetSort={null}
        onCycleCetSort={() => {}}
        onSelectDivida={() => {}}
      />,
    );
    expect(nomes()).toEqual(['Cara', 'Quitada']);
    expect(screen.getByText('Total em aberto')).toBeInTheDocument();
    expect(screen.getByText('R$ 10.000,00', { selector: 'span.block' })).toBeInTheDocument();
    expect(screen.getAllByText('3 de 12 parcelas pagas')).toHaveLength(2);
  });

  it('tocar no cartão abre o detalhe', () => {
    const onSelect = vi.fn();
    render(
      <DividasCards
        dividas={[CARA]}
        totalDevido={10000}
        totalParcelas={0}
        cetSort={null}
        onCycleCetSort={() => {}}
        onSelectDivida={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Cara/ }));
    expect(onSelect).toHaveBeenCalledWith('a');
  });
});

describe('DividasTable no celular (ciclo do CET)', () => {
  const original = window.matchMedia;
  beforeEach(() => mockMatchMedia(true));
  afterEach(() => {
    window.matchMedia = original;
  });

  it('vira cartões e o chip cicla maior → menor → ordem original', () => {
    render(<DividasTable dividas={[BARATA, CARA, QUITADA]} onSelectDivida={() => {}} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(nomes()).toEqual(['Barata', 'Cara', 'Quitada']);

    const chip = document.querySelector<HTMLButtonElement>('button[aria-pressed]')!;
    expect(chip).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(chip);
    expect(chip).toHaveTextContent('CET: maior primeiro');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(nomes()).toEqual(['Cara', 'Barata', 'Quitada']);

    fireEvent.click(chip);
    expect(chip).toHaveTextContent('CET: menor primeiro');
    expect(nomes()).toEqual(['Barata', 'Cara', 'Quitada']);

    fireEvent.click(chip);
    expect(chip).toHaveTextContent('Ordenar por CET');
    expect(nomes()).toEqual(['Barata', 'Cara', 'Quitada']);
  });

  it('no desktop continua a tabela', () => {
    mockMatchMedia(false);
    render(<DividasTable dividas={[CARA]} onSelectDivida={() => {}} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(document.querySelector('[data-mf-card]')).toBeNull();
  });
});
