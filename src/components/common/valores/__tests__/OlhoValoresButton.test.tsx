// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/carteira' }));

import { OlhoValoresButton } from '../OlhoValoresButton';
import { ValoresOcultosProvider } from '@/context/ValoresOcultosContext';

const renderOlho = (variant: 'mobile' | 'sidebar', habilitado = true, inicial = false) =>
  render(
    <ValoresOcultosProvider habilitado={habilitado} inicial={inicial}>
      <OlhoValoresButton variant={variant} />
    </ValoresOcultosProvider>,
  );

describe('<OlhoValoresButton>', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    document.documentElement.removeAttribute('data-valores-ocultos');
  });

  it.each(['mobile', 'sidebar'] as const)('%s: 44×44, nome fixo e aria-pressed', (variant) => {
    renderOlho(variant);
    const botao = screen.getByRole('button', { name: 'Esconder valores' });
    expect(botao).toHaveClass('h-11', 'w-11');
    expect(botao).toHaveAttribute('aria-pressed', 'false');
    expect(botao).toHaveAttribute('title', 'Esconder valores');

    fireEvent.click(botao);

    expect(screen.getByRole('button', { name: 'Esconder valores' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(botao).toHaveAttribute('title', 'Mostrar valores');
    expect(document.documentElement).toHaveAttribute('data-valores-ocultos');
  });

  it('sidebar redondo com borda; mobile com raio 12px', () => {
    renderOlho('sidebar');
    expect(screen.getByRole('button', { name: 'Esconder valores' })).toHaveClass(
      'rounded-full',
      'border',
    );
  });

  it('mobile com raio 12px', () => {
    renderOlho('mobile');
    expect(screen.getByRole('button', { name: 'Esconder valores' })).toHaveClass('rounded-xl');
  });

  it('começa pressionado quando o cookie já veio ligado', () => {
    renderOlho('mobile', true, true);
    expect(screen.getByRole('button', { name: 'Esconder valores' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('null com a flag desligada (e fora do provider)', () => {
    const { container } = renderOlho('mobile', false);
    expect(container.querySelector('button')).toBeNull();
    const fora = render(<OlhoValoresButton variant="sidebar" />);
    expect(fora.container.innerHTML).toBe('');
  });
});
