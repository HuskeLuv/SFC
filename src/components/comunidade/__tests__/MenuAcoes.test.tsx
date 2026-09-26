// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MenuAcoes, type ItemMenu } from '../shared';

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

const itens = (calls: string[]): ItemMenu[] => [
  { rotulo: 'Editar', onClick: () => calls.push('editar') },
  { rotulo: 'Excluir', perigo: true, onClick: () => calls.push('excluir') },
];

describe('MenuAcoes', () => {
  afterEach(() => {
    // @ts-expect-error — limpa o stub do jsdom
    delete window.matchMedia;
  });

  it('desktop: continua o dropdown de hoje (sem action sheet)', () => {
    stubMatchMedia(false);
    const calls: string[] = [];
    render(<MenuAcoes itens={itens(calls)} rotulo="Ações da publicação" />);
    const botao = screen.getByRole('button', { name: 'Ações da publicação' });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(botao);
    expect(document.querySelector('[data-mf-action-sheet]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(calls).toEqual(['excluir']);
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  });

  it('celular: ⋯ de 44px abre o action sheet e a ação roda depois de fechar', async () => {
    stubMatchMedia(true);
    const calls: string[] = [];
    const lista = itens(calls).map((i) => ({
      ...i,
      onClick: () => {
        calls.push(document.querySelector('[data-mf-action-sheet]') ? 'aberto' : 'fechado');
        i.onClick();
      },
    }));
    render(<MenuAcoes itens={lista} rotulo="Ações da publicação" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ações da publicação' }));
    const sheet = document.querySelector('[data-mf-action-sheet]');
    expect(sheet).not.toBeNull();
    const excluir = screen.getByRole('button', { name: 'Excluir' });
    expect(excluir.className).toContain('text-[#D92D20]');
    fireEvent.click(excluir);
    await waitFor(() => expect(calls).toEqual(['fechado', 'excluir']));
  });

  it('sem itens não renderiza nada', () => {
    stubMatchMedia(true);
    const { container } = render(<MenuAcoes itens={[]} rotulo="Ações" />);
    expect(container.innerHTML).toBe('');
  });
});
