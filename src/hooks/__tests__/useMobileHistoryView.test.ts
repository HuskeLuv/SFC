// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMobileHistoryView } from '../useMobileHistoryView';

describe('useMobileHistoryView', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/dividas');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('desabilitado (desktop): estado local, sem pushState/back/replaceState', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const back = vi.spyOn(window.history, 'back');
    const replace = vi.spyOn(window.history, 'replaceState');
    const { result } = renderHook(() => useMobileHistoryView('divida', false));
    act(() => result.current.open('abc'));
    expect(result.current.value).toBe('abc');
    act(() => result.current.close());
    expect(result.current.value).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it('habilitado: open empilha ?divida=; close volta pela entrada que empilhou', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { result } = renderHook(() => useMobileHistoryView('divida', true));
    act(() => result.current.open('abc'));
    expect(result.current.value).toBe('abc');
    expect(window.location.search).toBe('?divida=abc');
    act(() => result.current.close());
    expect(result.current.value).toBeNull();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('habilitado: popstate atualiza o valor (voltar do sistema)', () => {
    const { result } = renderHook(() => useMobileHistoryView('divida', true));
    act(() => result.current.open('abc'));
    act(() => {
      window.history.replaceState(null, '', '/dividas');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.value).toBeNull();
    act(() => {
      window.history.replaceState(null, '', '/dividas?divida=xyz');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.value).toBe('xyz');
  });

  it('habilitado: deep link (?caixa=1) — close sem entrada nossa usa replaceState', () => {
    window.history.replaceState(null, '', '/conexoes-bancarias?caixa=1');
    const back = vi.spyOn(window.history, 'back');
    const { result } = renderHook(() => useMobileHistoryView('caixa', true));
    expect(result.current.value).toBe('1');
    act(() => result.current.close());
    expect(back).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
    expect(result.current.value).toBeNull();
  });
});
