// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedCallback } from '../useDebouncedCallback';

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('chama o callback uma vez após o delay quando há múltiplas invocações', async () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 200));

    act(() => {
      result.current('a');
      result.current('b');
      result.current('c');
    });

    expect(fn).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('reseta o timer a cada nova chamada (não dispara antes da última)', async () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 200));

    act(() => {
      result.current('a');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(fn).not.toHaveBeenCalled();

    act(() => {
      result.current('b');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    // 300ms total desde a primeira, mas só 150ms desde a segunda — não dispara ainda
    expect(fn).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('cancela o timer pendente no unmount', async () => {
    const fn = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(fn, 200));

    act(() => {
      result.current('a');
    });
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fn).not.toHaveBeenCalled();
  });

  it('chama callback com os argumentos da última invocação', async () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 100));

    act(() => {
      result.current('first', 1);
      result.current('second', 2);
      result.current('third', 3);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('third', 3);
  });
});
