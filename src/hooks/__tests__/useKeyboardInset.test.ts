// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useKeyboardInset } from '../useKeyboardInset';

/** visualViewport controlável. */
function stubVisualViewport(height: number, offsetTop = 0) {
  const listeners = new Map<string, Set<() => void>>();
  const vv = {
    height,
    offsetTop,
    addEventListener: (type: string, cb: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    },
    removeEventListener: (type: string, cb: () => void) => listeners.get(type)?.delete(cb),
  };
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
  return {
    set(next: { height?: number; offsetTop?: number }, type: 'resize' | 'scroll' = 'resize') {
      Object.assign(vv, next);
      listeners.get(type)?.forEach((cb) => cb());
    },
    count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  };
}

describe('useKeyboardInset', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
  });
  afterEach(() => {
    // @ts-expect-error — remove o stub
    delete window.visualViewport;
  });

  it('sem teclado: inset 0 e altura da janela', () => {
    stubVisualViewport(844);
    const { result } = renderHook(() => useKeyboardInset(true));
    expect(result.current).toEqual({ inset: 0, height: 844, offsetTop: 0 });
  });

  it('teclado do iOS (janela não encolhe): inset = innerHeight − vv.height − offsetTop', () => {
    const vv = stubVisualViewport(844);
    const { result } = renderHook(() => useKeyboardInset(true));
    act(() => vv.set({ height: 500 }));
    expect(result.current).toEqual({ inset: 344, height: 500, offsetTop: 0 });
    // o iOS rola a página: a área visível desce e o inset diminui
    act(() => vv.set({ offsetTop: 100 }, 'scroll'));
    expect(result.current).toEqual({ inset: 244, height: 500, offsetTop: 100 });
  });

  it('Android com resizes-content (a janela encolhe junto): inset ~0, sem somar duas vezes', () => {
    const vv = stubVisualViewport(844);
    const { result } = renderHook(() => useKeyboardInset(true));
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 });
    act(() => vv.set({ height: 500 }));
    expect(result.current.inset).toBe(0);
  });

  it('desligado: não escuta e devolve o estado fechado', () => {
    const vv = stubVisualViewport(500);
    const { result } = renderHook(() => useKeyboardInset(false));
    expect(result.current).toEqual({ inset: 0, height: null, offsetTop: 0 });
    expect(vv.count()).toBe(0);
  });

  it('sem visualViewport: 0/null', () => {
    const { result } = renderHook(() => useKeyboardInset(true));
    expect(result.current).toEqual({ inset: 0, height: null, offsetTop: 0 });
  });

  it('remove os listeners ao desmontar', () => {
    const vv = stubVisualViewport(844);
    const { unmount } = renderHook(() => useKeyboardInset(true));
    expect(vv.count()).toBe(2);
    unmount();
    expect(vv.count()).toBe(0);
  });
});
