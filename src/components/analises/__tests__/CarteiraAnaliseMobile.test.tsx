// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/components/analises/RentabilidadeGeral', () => ({
  default: () => <div>conteudo-rentabilidade</div>,
}));
vi.mock('@/components/analises/ProventosTabs', () => ({
  default: () => <div>conteudo-proventos</div>,
}));
vi.mock('@/components/analises/RiscoRetorno', () => ({
  default: () => <div>conteudo-risco</div>,
}));
vi.mock('@/components/analises/CoberturaFgc', () => ({
  default: () => <div>conteudo-fgc</div>,
}));
vi.mock('@/components/analises/IRTabs', () => ({
  default: () => <div>conteudo-ir</div>,
}));

import CarteiraAnalise from '@/components/carteira/CarteiraAnalise';
import { desktopTabClassName } from '@/components/ui/tabs/ResponsiveTabNav';

function stubMatchMedia(mobile: boolean) {
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

const NOMES = [
  'Rentabilidade Geral',
  'Proventos',
  'Risco x Retorno',
  'Cobertura FGC',
  'Imposto de Renda',
];

afterEach(() => {
  // @ts-expect-error — remove o stub
  delete window.matchMedia;
});

describe('CarteiraAnalise — celular (< lg)', () => {
  it('sub-abas em chips (trilho com data-mf-scroll-x) e carregadas sob demanda', async () => {
    stubMatchMedia(true);
    render(<CarteiraAnalise />);

    const nav = screen.getByRole('navigation', { name: 'Análises da carteira' });
    expect(nav.hasAttribute('data-mf-scroll-x')).toBe(true);
    for (const nome of NOMES) {
      expect(await screen.findByRole('button', { name: nome })).toBeTruthy();
    }

    expect(await screen.findByText('conteudo-rentabilidade')).toBeTruthy();
    expect(screen.queryByText('conteudo-proventos')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Proventos' }));
    expect(await screen.findByText('conteudo-proventos')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Proventos' }).getAttribute('aria-current')).toBe(
      'page',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Imposto de Renda' }));
    expect(await screen.findByText('conteudo-ir')).toBeTruthy();
  });

  it('o h1 "Análises" fica só para leitor de tela abaixo de lg', () => {
    stubMatchMedia(true);
    render(<CarteiraAnalise />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Análises' });
    expect(h1.className).toContain('max-lg:sr-only');
  });
});

describe('CarteiraAnalise — desktop (≥ lg)', () => {
  it('mantém as classes de aba de hoje', async () => {
    stubMatchMedia(false);
    render(<CarteiraAnalise />);
    const ativo = await screen.findByRole('button', { name: 'Rentabilidade Geral' });
    expect(ativo.className).toBe(desktopTabClassName('underline', true));
    expect(screen.getByRole('button', { name: 'Proventos' }).className).toBe(
      desktopTabClassName('underline', false),
    );
    expect(await screen.findByText('conteudo-rentabilidade')).toBeTruthy();
  });
});
