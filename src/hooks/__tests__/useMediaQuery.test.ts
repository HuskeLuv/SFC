// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { useMediaQuery, useIsBelowLg } from '../useMediaQuery';
import { MOBILE_MEDIA_QUERY } from '@/lib/ui/mobile';

type Listener = () => void;

function installMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<Listener>();
  const matchMedia = vi.fn((query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    matchMedia,
    listeners,
    set(next: boolean) {
      matches = next;
      listeners.forEach((l) => l());
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
  it('devolve o valor atual do matchMedia', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1px)'));
    expect(result.current).toBe(true);
  });

  it('reage ao evento change e remove o listener no unmount', () => {
    const mm = installMatchMedia(false);
    const { result, unmount } = renderHook(() => useMediaQuery('(max-width: 500px)'));
    expect(result.current).toBe(false);
    act(() => mm.set(true));
    expect(result.current).toBe(true);
    unmount();
    expect(mm.listeners.size).toBe(0);
  });

  it('no servidor devolve o serverFallback', () => {
    installMatchMedia(true);
    const Probe = ({ fallback }: { fallback?: boolean }) =>
      createElement('span', null, String(useMediaQuery('(x)', fallback)));
    expect(renderToString(createElement(Probe))).toContain('false');
    expect(renderToString(createElement(Probe, { fallback: true }))).toContain('true');
  });

  it('useIsBelowLg usa MOBILE_MEDIA_QUERY', () => {
    const mm = installMatchMedia(true);
    const { result } = renderHook(() => useIsBelowLg());
    expect(result.current).toBe(true);
    expect(mm.matchMedia).toHaveBeenCalledWith(MOBILE_MEDIA_QUERY);
  });
});
