// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import OrcamentoMobileList from '../OrcamentoMobileList';
import type { OrcamentoLinha } from '../OrcamentoTable';

function stubMatchMedia(mobile = true) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: mobile,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

const linha = (over: Partial<OrcamentoLinha>): OrcamentoLinha => ({
  key: 'g-1',
  nome: 'Habitação',
  parentNome: 'Despesas Fixas',
  metaBase: 1000,
  tipoMeta: 'valor',
  metaJanela: 1000,
  real: 500,
  isInvestimentos: false,
  ...over,
});

const LINHAS: OrcamentoLinha[] = [
  linha({ key: 'dentro', nome: 'Habitação', real: 790 }),
  linha({ key: 'atencao', nome: 'Transporte', real: 800 }),
  linha({ key: 'atingido', nome: 'Saúde', real: 1000 }),
  linha({ key: 'estourou', nome: 'Lazer', real: 1250 }),
  linha({ key: 'sem', nome: 'Educação', metaBase: null, metaJanela: null, real: 300 }),
];

const INVESTIMENTOS = linha({
  key: 'investimentos',
  nome: 'Investimentos',
  parentNome: null,
  metaBase: 10,
  tipoMeta: 'percentual',
  metaJanela: 2000,
  real: 2500,
  isInvestimentos: true,
});

const TOTAIS = { meta: 4000, real: 4140, diferenca: -140 };

function renderList(onSaveMeta = vi.fn().mockResolvedValue(undefined)) {
  render(
    <OrcamentoMobileList
      linhas={LINHAS}
      investimentos={INVESTIMENTOS}
      totais={TOTAIS}
      mesesNaJanela={1}
      onSaveMeta={onSaveMeta}
    />,
  );
  return onSaveMeta;
}

const card = (key: string) =>
  document.querySelector(`[data-mf-orcamento-card="${key}"]`) as HTMLElement;

describe('OrcamentoMobileList', () => {
  beforeEach(() => {
    stubMatchMedia(true);
    document.body.style.overflow = '';
  });

  it('selo em texto por faixa (mesmos cortes do sino)', () => {
    renderList();
    expect(within(card('dentro')).getByText('Dentro da meta')).toBeInTheDocument();
    expect(within(card('atencao')).getByText('Atenção: 80% usado')).toBeInTheDocument();
    expect(within(card('atingido')).getByText('Meta atingida')).toBeInTheDocument();
    expect(within(card('estourou')).getByText(/^Estourou R\$\s250,00$/)).toBeInTheDocument();
    expect(within(card('sem')).getByText('Sem meta')).toBeInTheDocument();
    expect(within(card('investimentos')).getByText('Meta de aporte atingida')).toBeInTheDocument();
  });

  it('cartões com data-mf-card, Investimentos antes do Total e Total no fim', () => {
    renderList();
    const cards = Array.from(document.querySelectorAll('[data-mf-card]')).map((el) =>
      el.getAttribute('data-mf-orcamento-card'),
    );
    expect(cards).toEqual([
      'dentro',
      'atencao',
      'atingido',
      'estourou',
      'sem',
      'investimentos',
      'total',
    ]);
    expect(within(card('total')).getByText(/Passou R\$\s140,00/)).toBeInTheDocument();
  });

  it('nome acessível do cartão tem valores, nível e a ação', () => {
    renderList();
    expect(
      screen.getByRole('button', {
        name: /^Lazer, em Despesas Fixas, real R\$\s1\.250,00 de R\$\s1\.000,00, Estourou R\$\s250,00, Editar meta$/,
      }),
    ).toBeInTheDocument();
  });

  it('editar meta de categoria chama onSaveMeta com o valor mensal em R$', async () => {
    const onSaveMeta = renderList();
    fireEvent.click(card('estourou'));
    const campo = await screen.findByLabelText('Meta por mês');
    fireEvent.change(campo, { target: { value: '1.500,50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar meta' }));
    await waitFor(() => expect(onSaveMeta).toHaveBeenCalledWith('estourou', 1500.5, 'valor'));
  });

  it('campo vazio remove a meta', async () => {
    const onSaveMeta = renderList();
    fireEvent.click(card('dentro'));
    const campo = await screen.findByLabelText('Meta por mês');
    fireEvent.change(campo, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar meta' }));
    await waitFor(() => expect(onSaveMeta).toHaveBeenCalledWith('dentro', null, 'valor'));
  });

  it('falha mantém o sheet aberto com a mensagem', async () => {
    const onSaveMeta = vi.fn().mockResolvedValue({ error: 'Meta inválida' });
    renderList(onSaveMeta);
    fireEvent.click(card('atencao'));
    const campo = await screen.findByLabelText('Meta por mês');
    fireEvent.change(campo, { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar meta' }));
    expect(await screen.findByText('Meta inválida')).toBeInTheDocument();
    expect(screen.getByLabelText('Meta por mês')).toBeInTheDocument();
  });

  it('Investimentos: escolhe R$ por mês ou % da renda antes do valor', async () => {
    const onSaveMeta = renderList();
    fireEvent.click(card('investimentos'));
    const tipo = await screen.findByLabelText('Como definir a meta');
    expect((tipo as HTMLSelectElement).value).toBe('percentual');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    const campo = await screen.findByLabelText('Percentual da renda do mês');
    expect((campo as HTMLInputElement).value).toBe('10');
    fireEvent.change(campo, { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar meta' }));
    await waitFor(() => expect(onSaveMeta).toHaveBeenCalledWith('investimentos', 15, 'percentual'));
  });

  it('Investimentos: trocar para R$ começa vazio e grava em R$', async () => {
    const onSaveMeta = renderList();
    fireEvent.click(card('investimentos'));
    const tipo = await screen.findByLabelText('Como definir a meta');
    fireEvent.change(tipo, { target: { value: 'valor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    const campo = await screen.findByLabelText('Meta por mês');
    expect((campo as HTMLInputElement).value).toBe('');
    fireEvent.change(campo, { target: { value: '2.500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar meta' }));
    await waitFor(() => expect(onSaveMeta).toHaveBeenCalledWith('investimentos', 2500, 'valor'));
  });
});
