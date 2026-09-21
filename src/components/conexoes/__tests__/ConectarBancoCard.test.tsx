// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  config: { data: { habilitado: true, incluiSandbox: false } as unknown },
  conexoes: { data: [] as unknown[], isSuccess: true },
  auth: { actingClient: null as unknown },
  useConexoes: vi.fn(),
}));

vi.mock('@/hooks/useConexoesBancarias', () => ({
  usePluggyConfig: () => mocks.config,
  useConexoes: (enabled: boolean) => {
    mocks.useConexoes(enabled);
    return mocks.conexoes;
  },
}));
vi.mock('@/context/AuthContext', () => ({ useAuthOptional: () => mocks.auth }));

import ConectarBancoCard from '../ConectarBancoCard';

describe('ConectarBancoCard', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.config = { data: { habilitado: true, incluiSandbox: false } };
    mocks.conexoes = { data: [], isSuccess: true };
    mocks.auth = { actingClient: null };
  });
  afterEach(() => vi.clearAllMocks());

  it('sem banco conectado: convida e leva à jornada de conexão', () => {
    render(<ConectarBancoCard contexto="fluxo" />);
    expect(screen.getByText('Conecte seu banco pelo Open Finance.')).toBeInTheDocument();
    expect(screen.getByText(/nunca movimenta seu dinheiro/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Conectar banco' })).toHaveAttribute(
      'href',
      '/conexoes-bancarias?conectar=1',
    );
  });

  it('some com a integração desligada, com banco conectado ou para consultor', () => {
    mocks.config = { data: { habilitado: false, incluiSandbox: false } };
    const { container, rerender } = render(<ConectarBancoCard contexto="carteira" />);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.useConexoes).toHaveBeenLastCalledWith(false);

    mocks.config = { data: { habilitado: true, incluiSandbox: false } };
    mocks.conexoes = { data: [{ id: 'c1' }], isSuccess: true };
    rerender(<ConectarBancoCard contexto="carteira" />);
    expect(container).toBeEmptyDOMElement();

    mocks.conexoes = { data: [], isSuccess: true };
    mocks.auth = { actingClient: { id: 'cliente' } };
    rerender(<ConectarBancoCard contexto="carteira" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('"Agora não" esconde nesta tela e lembra da escolha', () => {
    const { container, unmount } = render(<ConectarBancoCard contexto="carteira" />);
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(container).toBeEmptyDOMElement();
    unmount();
    const outra = render(<ConectarBancoCard contexto="carteira" />);
    expect(outra.container).toBeEmptyDOMElement();
    outra.unmount();
    // a dispensa é por tela: o Fluxo continua mostrando
    render(<ConectarBancoCard contexto="fluxo" />);
    expect(screen.getByText('Conecte seu banco pelo Open Finance.')).toBeInTheDocument();
  });
});
