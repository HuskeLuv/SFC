// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MobileTabRail, stripEmoji, type MobileTabRailTab } from '../MobileTabRail';

const TABS: MobileTabRailTab[] = [
  { id: 'proj', label: '📊 Projeção' },
  { id: 'track', label: '📅 Acompanhamento', mobileLabel: 'Acompanhar' },
  { id: 'evol', label: '📈 Evolução', count: 3 },
];

describe('MobileTabRail', () => {
  it("semantics='tabs': tablist, tab e aria-selected; setas movem o foco", () => {
    render(
      <MobileTabRail
        tabs={TABS}
        activeId="proj"
        onChange={() => {}}
        ariaLabel="Seções do simulador"
        variant="segmented"
        semantics="tabs"
      />,
    );
    expect(screen.getByRole('tablist', { name: 'Seções do simulador' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[1]);
    fireEvent.keyDown(tabs[1], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tabs[0]);
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tabs[2]);
  });

  it("semantics='filter': aria-pressed, sem role=tab", () => {
    const onChange = vi.fn();
    render(
      <MobileTabRail
        tabs={TABS}
        activeId="track"
        onChange={onChange}
        ariaLabel="Prazo"
        variant="chips"
        semantics="filter"
      />,
    );
    expect(screen.queryByRole('tab')).toBeNull();
    const ativo = screen.getByRole('button', { name: 'Acompanhar' });
    expect(ativo).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Projeção' }));
    expect(onChange).toHaveBeenCalledWith('proj');
  });

  it("semantics='nav': aria-current=page só no ativo", () => {
    render(
      <MobileTabRail
        tabs={TABS}
        activeId="evol"
        onChange={() => {}}
        ariaLabel="Modo"
        variant="segmented"
        semantics="nav"
      />,
    );
    expect(screen.getByRole('button', { name: 'Evolução (3)' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'Projeção' })).not.toHaveAttribute('aria-current');
  });

  it('rótulo visível = mobileLabel ?? label, sem emoji', () => {
    render(
      <MobileTabRail
        tabs={TABS}
        activeId="proj"
        onChange={() => {}}
        ariaLabel="x"
        variant="chips"
        semantics="filter"
      />,
    );
    expect(screen.getByText('Acompanhar')).toBeInTheDocument();
    expect(screen.queryByText(/📊/)).toBeNull();
    expect(stripEmoji('📈 Evolução')).toBe('Evolução');
  });

  it('chips: trilho com data-mf-scroll-x e rolagem até o ativo', () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    const { container, rerender } = render(
      <MobileTabRail
        tabs={TABS}
        activeId="proj"
        onChange={() => {}}
        ariaLabel="x"
        variant="chips"
        semantics="filter"
      />,
    );
    const rail = container.querySelector('[data-mf-scroll-x]');
    expect(rail).not.toBeNull();
    expect(rail).toHaveAttribute('data-mf-mobile');
    scrollTo.mockClear();
    rerender(
      <MobileTabRail
        tabs={TABS}
        activeId="evol"
        onChange={() => {}}
        ariaLabel="x"
        variant="chips"
        semantics="filter"
      />,
    );
    expect(scrollTo).toHaveBeenCalledTimes(1);
    // @ts-expect-error — remove o stub
    delete HTMLElement.prototype.scrollTo;
  });
});
