// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BottomSheet from '../BottomSheet';

/** matchMedia controlável: `setMobile(false)` simula a janela passando a lg. */
function stubMatchMedia(initialMobile: boolean) {
  let mobile = initialMobile;
  const listeners = new Set<() => void>();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      get matches() {
        return mobile;
      },
      media: query,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    }),
  });
  return {
    setMobile(next: boolean) {
      mobile = next;
      listeners.forEach((cb) => cb());
    },
    listenerCount: () => listeners.size,
  };
}

describe('BottomSheet', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });
  afterEach(() => {
    // @ts-expect-error — remove o stub
    delete window.matchMedia;
  });

  it('trava a rolagem enquanto aberto', () => {
    stubMatchMedia(true);
    render(
      <BottomSheet isOpen onClose={() => {}} title="Mais">
        conteúdo
      </BottomSheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Mais' })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('fecha quando a janela passa a lg (a trava não prende o desktop)', () => {
    const mq = stubMatchMedia(true);
    const onClose = vi.fn();
    const { unmount } = render(
      <BottomSheet isOpen onClose={onClose} title="Mais">
        conteúdo
      </BottomSheet>,
    );
    mq.setMobile(true);
    expect(onClose).not.toHaveBeenCalled();
    mq.setMobile(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(mq.listenerCount()).toBe(0);
  });

  it('teclado aberto (iOS): o painel sobe o inset e limita a altura à área visível', () => {
    stubMatchMedia(true);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { height: 500, offsetTop: 0, addEventListener() {}, removeEventListener() {} },
    });
    try {
      render(
        <BottomSheet isOpen onClose={() => {}} title="Editar">
          conteúdo
        </BottomSheet>,
      );
      const panel = screen.getByRole('dialog', { name: 'Editar' });
      expect(panel.style.bottom).toBe('344px');
      expect(panel.style.maxHeight).toBe('calc(500px - 1rem)');
    } finally {
      // @ts-expect-error — remove o stub
      delete window.visualViewport;
    }
  });

  it('sem teclado: sem style (mesmo painel da fase 0)', () => {
    stubMatchMedia(true);
    render(
      <BottomSheet isOpen onClose={() => {}} title="Mais">
        conteúdo
      </BottomSheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Mais' }).getAttribute('style')).toBeNull();
  });

  it('não rouba o foco de um campo com autoFocus e devolve o foco ao gatilho ao fechar', () => {
    stubMatchMedia(true);
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">Editar</button>
          <BottomSheet isOpen={open} onClose={() => {}} title="Objetivo">
            <input aria-label="Valor" autoFocus />
          </BottomSheet>
        </>
      );
    }
    const { rerender } = render(<Harness open={false} />);
    const trigger = screen.getByRole('button', { name: 'Editar' });
    trigger.focus();
    rerender(<Harness open />);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Valor' }));
    rerender(<Harness open={false} />);
    expect(document.activeElement).toBe(trigger);
  });

  it('sem campo com autoFocus: o foco vai para o painel', () => {
    stubMatchMedia(true);
    render(
      <BottomSheet isOpen onClose={() => {}} title="Mais">
        conteúdo
      </BottomSheet>,
    );
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Mais' }));
  });
});
