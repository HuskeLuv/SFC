// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import BottomSheet from '../BottomSheet';
import {
  claimLayerEvent,
  isTopLayer,
  layerCount,
  popLayer,
  pushLayer,
  shouldHandleLayerEvent,
  useTopLayer,
} from '../layerStack';

function stubMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

describe('layerStack (módulo)', () => {
  afterEach(() => {
    popLayer('a');
    popLayer('b');
  });

  it('o último a entrar é o topo; ao sair, o de baixo volta a ser', () => {
    pushLayer('a');
    pushLayer('b');
    expect(isTopLayer('b')).toBe(true);
    expect(isTopLayer('a')).toBe(false);
    popLayer('b');
    expect(isTopLayer('a')).toBe(true);
    popLayer('a');
    expect(layerCount()).toBe(0);
  });

  it('a ordem vem do número de abertura, não da ordem do push', () => {
    pushLayer('b', 20);
    pushLayer('a', 10);
    expect(isTopLayer('b')).toBe(true);
  });

  it('um evento só é tratado por uma camada', () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    expect(claimLayerEvent(event)).toBe(true);
    expect(claimLayerEvent(event)).toBe(false);
    pushLayer('a');
    expect(shouldHandleLayerEvent('a', new KeyboardEvent('keydown'))).toBe(true);
    expect(shouldHandleLayerEvent('a', event)).toBe(false);
  });
});

function Probe({ open, label }: { open: boolean; label: string }) {
  const { isTop } = useTopLayer(open);
  return <span data-testid={label}>{isTop ? 'topo' : 'baixo'}</span>;
}

describe('useTopLayer', () => {
  it('isTop acompanha a pilha', () => {
    const { rerender } = render(
      <>
        <Probe open label="p1" />
        <Probe open={false} label="p2" />
      </>,
    );
    expect(screen.getByTestId('p1')).toHaveTextContent('topo');
    expect(screen.getByTestId('p2')).toHaveTextContent('baixo');
    rerender(
      <>
        <Probe open label="p1" />
        <Probe open label="p2" />
      </>,
    );
    expect(screen.getByTestId('p1')).toHaveTextContent('baixo');
    expect(screen.getByTestId('p2')).toHaveTextContent('topo');
    rerender(
      <>
        <Probe open label="p1" />
        <Probe open={false} label="p2" />
      </>,
    );
    expect(screen.getByTestId('p1')).toHaveTextContent('topo');
  });
});

describe('BottomSheet empilhado', () => {
  beforeEach(() => {
    stubMatchMedia();
    document.body.style.overflow = '';
  });
  afterEach(() => {
    // @ts-expect-error — remove o stub
    delete window.matchMedia;
  });

  function Stacked({
    onCloseBase,
    onCloseTop,
  }: {
    onCloseBase: () => void;
    onCloseTop: () => void;
  }) {
    const [baseOpen, setBaseOpen] = useState(true);
    const [topOpen, setTopOpen] = useState(false);
    return (
      <>
        <BottomSheet
          isOpen={baseOpen}
          onClose={() => {
            onCloseBase();
            setBaseOpen(false);
          }}
          title="Base"
        >
          <button type="button" onClick={() => setTopOpen(true)}>
            Abrir de cima
          </button>
        </BottomSheet>
        <BottomSheet
          isOpen={topOpen}
          onClose={() => {
            onCloseTop();
            setTopOpen(false);
          }}
          title="De cima"
        >
          <button type="button">Ação</button>
        </BottomSheet>
      </>
    );
  }

  it('Esc fecha só o de cima; o segundo Esc fecha a base', () => {
    const onCloseBase = vi.fn();
    const onCloseTop = vi.fn();
    render(<Stacked onCloseBase={onCloseBase} onCloseTop={onCloseTop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir de cima' }));
    expect(screen.getByRole('dialog', { name: 'De cima' })).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onCloseTop).toHaveBeenCalledTimes(1);
    expect(onCloseBase).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'De cima' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Base' })).toBeInTheDocument();
    // A trava de rolagem continua (a base segue aberta).
    expect(document.body.style.overflow).toBe('hidden');

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onCloseBase).toHaveBeenCalledTimes(1);
    expect(onCloseTop).toHaveBeenCalledTimes(1);
    expect(document.body.style.overflow).toBe('');
  });

  it('Tab fica preso no de cima', () => {
    render(<Stacked onCloseBase={() => {}} onCloseTop={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir de cima' }));
    const top = screen.getByRole('dialog', { name: 'De cima' });
    const acao = screen.getByRole('button', { name: 'Ação' });
    acao.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // Do último focável volta ao primeiro (o "Fechar" do sheet de cima), sem ir para a base.
    expect(top.contains(document.activeElement)).toBe(true);
  });

  it('sheet sozinho: Esc fecha como sempre', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen onClose={onClose} title="Só">
        conteúdo
      </BottomSheet>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
