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
});
