// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '../Sidebar';

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

describe('Sidebar — footer/headerExtra (PWA fase 1)', () => {
  afterEach(() => {
    // @ts-expect-error — remove o stub
    delete window.matchMedia;
    // @ts-expect-error — remove o stub
    delete window.visualViewport;
  });

  it('sem as props novas: nenhum rodapé nem style de teclado no desktop', () => {
    stubMatchMedia(false);
    render(
      <Sidebar isOpen onClose={() => {}} title="Adicionar Ativo à Carteira">
        <p>conteúdo</p>
      </Sidebar>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Adicionar Ativo à Carteira' });
    expect(dialog.querySelector('[data-mf-wizard-footer]')).toBeNull();
    expect(dialog.getAttribute('style') ?? '').not.toMatch(/height|top/);
  });

  it('footer vira div[data-mf-wizard-footer] só no celular; headerExtra também', () => {
    stubMatchMedia(true);
    render(
      <Sidebar
        isOpen
        onClose={() => {}}
        title="Wizard"
        headerExtra={<div>progresso</div>}
        footer={<button type="button">Avançar</button>}
      >
        <p>conteúdo</p>
      </Sidebar>,
    );
    const footer = document.querySelector('[data-mf-wizard-footer]')!;
    expect(footer).toHaveClass('lg:hidden', 'shrink-0');
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Avançar' }));
    expect(screen.getByText('progresso').parentElement).toHaveClass('lg:hidden');
  });

  it('celular com teclado: altura do painel = visualViewport', () => {
    stubMatchMedia(true);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { height: 500, offsetTop: 0, addEventListener() {}, removeEventListener() {} },
    });
    render(
      <Sidebar isOpen onClose={() => {}} title="Wizard" footer={<span>rodapé</span>}>
        <p>conteúdo</p>
      </Sidebar>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Wizard' });
    expect(dialog.style.height).toBe('500px');
  });
});
