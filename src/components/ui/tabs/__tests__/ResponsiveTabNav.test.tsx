// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ResponsiveTabNav, type ResponsiveTab } from '../ResponsiveTabNav';

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

/*
 * Strings copiadas LITERALMENTE do código de hoje (set/2026). Se um destes componentes mudar de
 * propósito, atualize aqui — a guarda é para o desktop não mudar por acidente na fase 1.
 */
// src/components/carteira/CarteiraTabs.tsx — MainTabButton
const MAIN_ACTIVE = `inline-flex items-center rounded-t-xl px-6 py-3 text-sm font-semibold transition-all duration-200 ease-in-out whitespace-nowrap ${'bg-gray-900 text-white dark:bg-gray-800 dark:text-gray-100 shadow-md'}`;
const MAIN_INACTIVE = `inline-flex items-center rounded-t-xl px-6 py-3 text-sm font-semibold transition-all duration-200 ease-in-out whitespace-nowrap ${'bg-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`;
// CarteiraResumo / CarteiraAnalise / analises/ProventosTabs / analises/IRTabs — TabButton
const SUB_ACTIVE = `inline-flex items-center border-b-2 px-3 py-3 text-sm font-medium transition-colors duration-200 ease-in-out whitespace-nowrap ${'text-brand-500 dark:text-brand-400 border-brand-500 dark:border-brand-400'}`;
const SUB_INACTIVE = `inline-flex items-center border-b-2 px-3 py-3 text-sm font-medium transition-colors duration-200 ease-in-out whitespace-nowrap ${'bg-transparent text-gray-500 border-transparent hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`;
// <nav> do CarteiraTabs e do CarteiraResumo/CarteiraAnalise
const MAIN_NAV = 'flex space-x-1';
const SUB_NAV =
  '-mb-px flex space-x-2 overflow-x-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 dark:[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:h-1.5';

const MAIN_TABS: ResponsiveTab[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'analise', label: 'Análise' },
];
const CLASS_TABS: ResponsiveTab[] = [
  { id: 'consolidada', label: 'Carteira Consolidada' },
  { id: 'acoes', label: 'Ações' },
  { id: 'reit', label: "REIT's", muted: true },
  { id: 'moedas', label: 'Moedas, Criptomoedas & outros', mobileLabel: 'Moedas e cripto' },
];

describe('ResponsiveTabNav — desktop (≥ lg)', () => {
  afterEach(() => {
    // @ts-expect-error — remove o stub
    delete window.matchMedia;
  });

  it('variant main: classes idênticas ao MainTabButton de hoje', () => {
    stubMatchMedia(false);
    render(
      <ResponsiveTabNav
        tabs={MAIN_TABS}
        activeId="resumo"
        onChange={() => {}}
        ariaLabel="Seções da carteira"
        variant="main"
      />,
    );
    expect(screen.getByRole('button', { name: 'Resumo' }).className).toBe(MAIN_ACTIVE);
    expect(screen.getByRole('button', { name: 'Análise' }).className).toBe(MAIN_INACTIVE);
    expect(screen.getByRole('navigation').className).toBe(MAIN_NAV);
  });

  it('variant underline e segmented-sub: classes idênticas ao TabButton de hoje', () => {
    stubMatchMedia(false);
    for (const variant of ['underline', 'segmented-sub'] as const) {
      const { unmount } = render(
        <ResponsiveTabNav
          tabs={CLASS_TABS}
          activeId="acoes"
          onChange={() => {}}
          ariaLabel="Classes"
          variant={variant}
          leading={<button type="button">Todas</button>}
        />,
      );
      expect(screen.getByRole('button', { name: 'Ações' }).className).toBe(SUB_ACTIVE);
      expect(screen.getByRole('button', { name: 'Carteira Consolidada' }).className).toBe(
        SUB_INACTIVE,
      );
      // muted não mexe no desktop; o rótulo é sempre o completo; `leading` é só do celular.
      expect(screen.getByRole('button', { name: "REIT's" }).className).toBe(SUB_INACTIVE);
      expect(
        screen.getByRole('button', { name: 'Moedas, Criptomoedas & outros' }),
      ).toHaveTextContent('Moedas, Criptomoedas & outros');
      expect(screen.queryByRole('button', { name: 'Todas' })).toBeNull();
      expect(screen.getByRole('navigation').className).toBe(SUB_NAV);
      unmount();
    }
  });

  it('aria-current no ativo e onChange com o id', () => {
    stubMatchMedia(false);
    const onChange = vi.fn();
    render(
      <ResponsiveTabNav
        tabs={CLASS_TABS}
        activeId="acoes"
        onChange={onChange}
        ariaLabel="Classes"
        variant="underline"
        navClassName="flex"
      />,
    );
    expect(screen.getByRole('button', { name: 'Ações' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Carteira Consolidada' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByRole('navigation').className).toBe('flex');
    fireEvent.click(screen.getByRole('button', { name: "REIT's" }));
    expect(onChange).toHaveBeenCalledWith('reit');
  });
});

describe('ResponsiveTabNav — celular (< lg)', () => {
  afterEach(() => {
    // @ts-expect-error — remove o stub
    delete window.matchMedia;
  });

  it('underline vira trilho de chips com área de toque (before:) e leading fixo', () => {
    stubMatchMedia(true);
    render(
      <ResponsiveTabNav
        tabs={CLASS_TABS}
        activeId="acoes"
        onChange={() => {}}
        ariaLabel="Classes"
        variant="underline"
        leading={<button type="button">Todas</button>}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Classes' });
    expect(nav).toHaveAttribute('data-mf-scroll-x');
    expect(nav.firstElementChild).toHaveTextContent('Todas');
    const active = screen.getByRole('button', { name: 'Ações' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active.className).toContain('before:-inset-y-1');
    expect(active.className).toContain('h-9');
    expect(active.className).toContain('bg-mf-seguranca');
    expect(screen.getByRole('button', { name: "REIT's" }).className).toContain('opacity-60');
  });

  it('mobileLabel: texto curto, nome acessível = label atual', () => {
    stubMatchMedia(true);
    render(
      <ResponsiveTabNav
        tabs={CLASS_TABS}
        activeId="acoes"
        onChange={() => {}}
        ariaLabel="Classes"
        variant="underline"
      />,
    );
    const btn = screen.getByRole('button', { name: 'Moedas, Criptomoedas & outros' });
    expect(btn).toHaveTextContent('Moedas e cripto');
  });

  it('main vira segmentado de 38px (44px com o padding do contêiner)', () => {
    stubMatchMedia(true);
    render(
      <ResponsiveTabNav
        tabs={MAIN_TABS}
        activeId="analise"
        onChange={() => {}}
        ariaLabel="Seções da carteira"
        variant="main"
        sticky
      />,
    );
    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('p-[3px]');
    expect(nav.parentElement?.className).toContain('sticky');
    const btn = screen.getByRole('button', { name: 'Análise' });
    expect(btn.className).toContain('h-[38px]');
    expect(btn).toHaveAttribute('aria-current', 'page');
  });
});
