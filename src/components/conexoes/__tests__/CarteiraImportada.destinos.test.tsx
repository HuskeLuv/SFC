// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type {
  CarteiraImportadaResposta,
  InvestimentoImportadoDTO,
} from '@/hooks/useConexoesBancarias';

/**
 * "Investimentos e empréstimos do banco" com o destino na importação (fatia D): aviso "N novos
 * para conferir" + "Conferir destinos (N)", coluna "Na Carteira em" com link para a aba e selo
 * "Novo · conferir". Sem os campos (chave PLUGGY_DESTINOS_HABILITADO desligada): tela de hoje.
 */

const h = vi.hoisted(() => ({ data: null as unknown, belowLg: false }));

vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => h.belowLg }));
vi.mock('@/hooks/useConexoesBancarias', () => ({
  useCarteiraImportada: () => ({ data: h.data, isLoading: false, isError: false, error: null }),
  useImportarCarteira: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useIgnorarInvestimento: () => ({ mutate: vi.fn(), isPending: false }),
}));

import CarteiraImportada from '../CarteiraImportada';

const inv = (o: Partial<InvestimentoImportadoDTO>): InvestimentoImportadoDTO => ({
  id: 'i1',
  banco: 'XP Investimentos',
  type: 'EQUITY',
  subtype: 'REAL_ESTATE_FUND',
  name: 'KNCA11',
  code: 'KNCA11',
  balance: 9580,
  quantity: 100,
  amountOriginal: null,
  rate: null,
  rateType: null,
  dueDate: null,
  issuer: null,
  status: 'ACTIVE',
  ativo: true,
  assetId: 'a1',
  portfolioId: 'p1',
  importStatus: 'importado',
  importError: null,
  importedAt: '2026-10-06T12:00:00.000Z',
  ...o,
});

const hoje: CarteiraImportadaResposta = {
  investimentos: [inv({ id: 'i1' }), inv({ id: 'i2', name: 'PETR4', code: 'PETR4' })],
  emprestimos: [],
};

const ligada: CarteiraImportadaResposta = {
  investimentos: [
    inv({
      id: 'i1',
      situacaoDestino: 'para-revisar',
      destino: {
        categoria: 'fiis',
        abaId: 'fiis',
        label: "FII's",
        subgrupoLabel: 'Tijolo',
        rotulo: "FII's › Tijolo",
      },
    }),
    inv({
      id: 'i2',
      name: 'PETR4',
      code: 'PETR4',
      situacaoDestino: 'confirmado',
      destino: {
        categoria: 'acoes',
        abaId: 'acoes',
        label: 'Ações',
        subgrupoLabel: 'Value',
        rotulo: 'Ações › Value',
      },
    }),
    inv({ id: 'i3', name: 'Previdência X', importStatus: 'vinculado', destino: null }),
  ],
  emprestimos: [],
  paraRevisar: 1,
};

const texto = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');

describe('CarteiraImportada — destinos', () => {
  beforeEach(() => {
    h.belowLg = false;
  });

  it('chave desligada: sem aviso, sem coluna "Na Carteira em" e sem selo', () => {
    h.data = hoje;
    render(<CarteiraImportada onAviso={vi.fn()} onConferirDestinos={vi.fn()} />);
    expect(screen.queryByText('Na Carteira em')).toBeNull();
    expect(screen.queryByRole('button', { name: /Conferir destinos/ })).toBeNull();
    expect(screen.queryByText('Novo · conferir')).toBeNull();
    const cabecalhos = screen.getAllByRole('columnheader').map((c) => c.textContent);
    expect(cabecalhos).toEqual(['Investimento', 'Tipo', 'Saldo no banco', 'Situação', '']);
  });

  it('chave ligada: aviso + "Conferir destinos (N)", coluna com link para a aba e selo', () => {
    h.data = ligada;
    const onConferir = vi.fn();
    render(<CarteiraImportada onAviso={vi.fn()} onConferirDestinos={onConferir} />);
    expect(texto()).toContain('1 investimento novo chegou na sincronização e já está na Carteira');
    fireEvent.click(screen.getByRole('button', { name: 'Conferir destinos (1)' }));
    expect(onConferir).toHaveBeenCalledTimes(1);

    const tabela = screen.getByRole('table', { name: 'Investimentos importados' });
    expect(within(tabela).getByText('Na Carteira em')).toBeInTheDocument();
    const ver = within(tabela).getByRole('link', { name: "Ver FII's › Tijolo na Carteira" });
    expect(ver).toHaveAttribute('href', '/carteira?aba=fiis');
    expect(ver.className).toContain('min-h-11');
    expect(
      within(tabela).getByRole('link', { name: 'Ver Ações › Value na Carteira' }),
    ).toHaveAttribute('href', '/carteira?aba=acoes');
    // Só o para-revisar ganha o selo; o confirmado continua "Na Carteira".
    expect(within(tabela).getAllByText('Novo · conferir')).toHaveLength(1);
    expect(within(tabela).getByText('Já estava na Carteira')).toBeInTheDocument();
  });

  it('chave ligada sem pendências: coluna aparece, aviso não', () => {
    h.data = { ...ligada, paraRevisar: 0 };
    render(<CarteiraImportada onAviso={vi.fn()} onConferirDestinos={vi.fn()} />);
    expect(screen.getByText('Na Carteira em')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Conferir destinos/ })).toBeNull();
  });

  it('celular: aviso com botão de largura total e "Na Carteira em" no cartão', () => {
    h.belowLg = true;
    h.data = ligada;
    render(<CarteiraImportada onAviso={vi.fn()} onConferirDestinos={vi.fn()} />);
    const botao = screen.getByRole('button', { name: 'Conferir destinos (1)' });
    expect(botao.className).toContain('max-lg:w-full');
    expect(
      screen.getByRole('link', { name: "Ver FII's › Tijolo na Carteira" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Novo · conferir')).toHaveLength(1);
  });
});
