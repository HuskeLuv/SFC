// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MobileCollapsible } from '../MobileCollapsible';

describe('MobileCollapsible', () => {
  it('fechado = mscreen:hidden (nunca "hidden": a impressão mostra o conteúdo)', () => {
    const { container } = render(
      <MobileCollapsible id="bloco-balanco" title="Balanço" summary="3 itens">
        <p>conteúdo</p>
      </MobileCollapsible>,
    );
    const content = container.querySelector('#bloco-balanco')!;
    expect(content).toHaveAttribute('data-mf-collapsible');
    expect(content.className.split(/\s+/)).toContain('mscreen:hidden');
    expect(content.className.split(/\s+/)).not.toContain('hidden');
    const header = screen.getByRole('button', { name: /Balanço/ });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(header).toHaveAttribute('aria-controls', 'bloco-balanco');
    // O cabeçalho só existe na tela abaixo de lg.
    expect(header.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['hidden', 'mscreen:flex']),
    );
    expect(header).toHaveAttribute('data-mf-mobile');
  });

  it('abre e fecha pelo cabeçalho; defaultOpen começa aberto', () => {
    const { container } = render(
      <MobileCollapsible id="b" title="Status" defaultOpen>
        <p>conteúdo</p>
      </MobileCollapsible>,
    );
    const content = container.querySelector('#b')!;
    expect(content.className).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Status' }));
    expect(content.className).toBe('mscreen:hidden');
    expect(screen.getByRole('button', { name: 'Status' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
