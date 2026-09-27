// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { OpcaoLinha, PendenteDTO } from '@/hooks/useConexoesBancarias';
import CaixaEntradaCards, { type CaixaEntradaCardsProps } from '../CaixaEntradaCards';

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

const LINHAS: OpcaoLinha[] = [
  { itemId: 'mercado', rotulo: 'Despesas Variáveis › Mercado', tipo: 'despesa' },
  { itemId: 'salario', rotulo: 'Entradas Fixas › Salário', tipo: 'entrada' },
];

const pend = (id: string, over: Partial<PendenteDTO> = {}): PendenteDTO =>
  ({
    id,
    accountId: 'acc',
    contaNome: 'Conta corrente',
    date: '2026-09-20T00:00:00.000Z',
    description: `Compra ${id}`,
    merchantName: null,
    amount: -50,
    type: 'DEBIT',
    providerCategory: 'Supermercado',
    sugestao: { tipo: 'nenhuma' },
    ...over,
  }) as PendenteDTO;

const PENDENTES = [
  pend('t1', {
    sugestao: { tipo: 'linha', itemId: 'mercado', rotulo: 'Mercado' },
  } as Partial<PendenteDTO>),
  pend('t2', { amount: 1200, description: 'Pix recebido' }),
];

function Harness(over: Partial<CaixaEntradaCardsProps>) {
  const [escolhas, setEscolhas] = useState<Record<string, string>>({ t1: 'mercado', t2: '' });
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  return (
    <CaixaEntradaCards
      pendentes={PENDENTES}
      linhas={LINHAS}
      escolhas={escolhas}
      setEscolha={(id, itemId) => setEscolhas((s) => ({ ...s, [id]: itemId }))}
      marcadas={marcadas}
      onAlternar={(id) =>
        setMarcadas((s) => {
          const n = new Set(s);
          if (n.has(id)) n.delete(id);
          else n.add(id);
          return n;
        })
      }
      ocupado={false}
      onLancar={vi.fn()}
      onIgnorar={vi.fn()}
      sugeridas={['t1']}
      transferencias={[]}
      rotuloSugestao={() => 'Sugestão: Mercado'}
      {...over}
    />
  );
}

beforeEach(() => stubMatchMedia(true));
afterEach(() => {
  // @ts-expect-error — remove o stub
  delete window.matchMedia;
});

const cardDe = (descricao: string) =>
  screen.getByLabelText(`Marcar ${descricao}`).closest('li') as HTMLElement;

describe('CaixaEntradaCards', () => {
  it('um cartão por transação: linha escolhida, valor sem verde e "Lançar" → onLancar([id])', () => {
    const onLancar = vi.fn();
    render(<Harness onLancar={onLancar} />);
    const c1 = cardDe('Compra t1');
    expect(within(c1).getByText('Despesas Variáveis › Mercado')).toBeTruthy();
    const c2 = cardDe('Pix recebido');
    expect(within(c2).getByText('— escolher linha —')).toBeTruthy();
    const valor = within(c2).getByText((_, el) => el?.textContent?.startsWith('+R$') ?? false, {
      selector: 'span',
    });
    expect(valor.className).not.toMatch(/green|emerald/);
    fireEvent.click(within(c1).getByRole('button', { name: 'Lançar' }));
    expect(onLancar).toHaveBeenCalledWith(['t1']);
    fireEvent.click(screen.getByRole('button', { name: 'Lançar sugeridas (1)' }));
    expect(onLancar).toHaveBeenLastCalledWith(['t1']);
    expect(
      (screen.getByRole('button', { name: 'Ignorar transferências (0)' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('picker filtra e chama setEscolha', () => {
    const setEscolha = vi.fn();
    render(<Harness setEscolha={setEscolha} />);
    const c2 = cardDe('Pix recebido');
    fireEvent.click(within(c2).getByRole('button', { name: /Linha para Pix recebido/ }));
    const dialog = screen.getByRole('dialog', { name: 'Linha do fluxo de caixa' });
    fireEvent.change(within(dialog).getByLabelText('Buscar linha'), {
      target: { value: 'salario' },
    });
    expect(within(dialog).queryByRole('button', { name: LINHAS[0].rotulo })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: LINHAS[1].rotulo }));
    expect(setEscolha).toHaveBeenCalledWith('t2', 'salario');
  });

  it('barra de marcadas aparece com os mesmos textos e age sobre as marcadas', () => {
    const onIgnorar = vi.fn();
    const onLancar = vi.fn();
    render(<Harness onIgnorar={onIgnorar} onLancar={onLancar} />);
    expect(screen.queryByRole('region', { name: 'Transações marcadas' })).toBeNull();
    fireEvent.click(screen.getByLabelText('Marcar Compra t1'));
    fireEvent.click(screen.getByLabelText('Marcar Pix recebido'));
    const barra = screen.getByRole('region', { name: 'Transações marcadas' });
    expect(within(barra).getByText('2 marcada(s)')).toBeTruthy();
    fireEvent.click(within(barra).getByRole('button', { name: 'Ignorar marcadas' }));
    expect(onIgnorar).toHaveBeenCalledWith(['t1', 't2']);
    fireEvent.click(within(barra).getByRole('button', { name: 'Lançar marcadas' }));
    expect(onLancar).toHaveBeenCalledWith(['t1', 't2']);
  });
});
