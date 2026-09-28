// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { OpcaoLinha } from '@/hooks/useConexoesBancarias';
import LinhaFluxoPickerSheet, { agruparLinhas, normalizarBusca } from '../LinhaFluxoPickerSheet';

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

const OPCOES: OpcaoLinha[] = [
  { itemId: 'luz', rotulo: 'Despesas Fixas › Habitação › Conta de energia', tipo: 'despesa' },
  { itemId: 'agua', rotulo: 'Despesas Fixas › Habitação › Água', tipo: 'despesa' },
  { itemId: 'mercado', rotulo: 'Despesas Variáveis › Mercado', tipo: 'despesa' },
  { itemId: 'salario', rotulo: 'Entradas Fixas › Salário', tipo: 'entrada' },
];

describe('normalizarBusca / agruparLinhas', () => {
  it('busca sem acento e sem caixa', () => {
    expect(normalizarBusca('  HabitAÇÃO ')).toBe('habitacao');
    const g = agruparLinhas(OPCOES, 'habitacao');
    expect(g.map((x) => x.nome)).toEqual(['Despesas Fixas']);
    expect(g[0].opcoes.map((o) => o.itemId)).toEqual(['luz', 'agua']);
  });

  it('sem busca: as MESMAS opções, agrupadas na ordem da estrutura', () => {
    const g = agruparLinhas(OPCOES, '');
    expect(g.map((x) => x.nome)).toEqual([
      'Despesas Fixas',
      'Despesas Variáveis',
      'Entradas Fixas',
    ]);
    expect(g.flatMap((x) => x.opcoes.map((o) => o.itemId))).toEqual(OPCOES.map((o) => o.itemId));
    expect(g[0].opcoes[0].resto).toBe('Habitação › Conta de energia');
  });
});

describe('LinhaFluxoPickerSheet', () => {
  beforeEach(() => stubMatchMedia(true));
  afterEach(() => {
    // @ts-expect-error — remove o stub
    delete window.matchMedia;
  });

  it('mostra todas as opções, filtra por texto sem acento e escolhe ao tocar', () => {
    const onEscolher = vi.fn();
    const onClose = vi.fn();
    render(
      <LinhaFluxoPickerSheet
        isOpen
        onClose={onClose}
        opcoes={OPCOES}
        valor="agua"
        onEscolher={onEscolher}
      />,
    );
    for (const o of OPCOES) expect(screen.getByRole('button', { name: o.rotulo })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: OPCOES[1].rotulo }).getAttribute('aria-pressed'),
    ).toBe('true');

    fireEvent.change(screen.getByLabelText('Buscar linha'), { target: { value: 'salario' } });
    expect(screen.queryByRole('button', { name: OPCOES[0].rotulo })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: OPCOES[3].rotulo }));
    expect(onEscolher).toHaveBeenCalledWith('salario');
    expect(onClose).toHaveBeenCalled();
  });

  it('busca sem resultado avisa', () => {
    render(
      <LinhaFluxoPickerSheet
        isOpen
        onClose={vi.fn()}
        opcoes={OPCOES}
        valor=""
        onEscolher={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Buscar linha'), { target: { value: 'zzz' } });
    expect(screen.getByText('Nenhuma linha encontrada.')).toBeTruthy();
  });
});
