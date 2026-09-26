// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ClassePickerSheet from '../ClassePickerSheet';
import { CARTEIRA_CLASS_TABS } from '../carteiraTabsConfig';

const distribuicao = {
  reservaEmergencia: { valor: 10000, percentual: 10 },
  acoes: { valor: 25000, percentual: 25 },
  fiis: { valor: 0, percentual: 0 },
  imoveisBens: { valor: 500000, percentual: 80 },
};

describe('ClassePickerSheet', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: true,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
  });
  afterEach(() => {
    // @ts-expect-error — jsdom sem matchMedia nos outros arquivos
    delete window.matchMedia;
    document.body.style.overflow = '';
  });

  const renderSheet = (onSelect = vi.fn(), onClose = vi.fn()) =>
    render(
      <ClassePickerSheet
        isOpen
        onClose={onClose}
        activeId="acoes"
        onSelect={onSelect}
        distribuicao={distribuicao}
        totalDinheiro={100000}
      />,
    );

  it('lista as 14 classes como rádios, com a ativa marcada', () => {
    renderSheet();
    expect(screen.getByRole('dialog', { name: 'Classes da carteira' })).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(CARTEIRA_CLASS_TABS.length);
    expect(screen.getByRole('radio', { name: /^Ações/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /^Reserva Emergência/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('mostra valor e % da carteira; vazia e imóveis com texto próprio', () => {
    renderSheet();
    expect(screen.getByRole('radio', { name: /^Ações/ })).toHaveTextContent('25,0% da carteira');
    expect(screen.getByRole('radio', { name: /^FII's/ })).toHaveTextContent('Vazia');
    expect(screen.getByRole('radio', { name: /^Imóveis & Bens/ })).toHaveTextContent(
      'fora da rentabilidade',
    );
  });

  it('tocar numa classe troca a aba e fecha', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    renderSheet(onSelect, onClose);
    fireEvent.click(screen.getByRole('radio', { name: /^Reserva Emergência/ }));
    expect(onSelect).toHaveBeenCalledWith('reserva-emergencia');
    expect(onClose).toHaveBeenCalled();
  });
});
