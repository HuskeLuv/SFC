// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { mockFetchResponse } from '@/test/mocks/fetch';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const swClient = vi.hoisted(() => ({
  clearAppCaches: vi.fn(() => Promise.resolve()),
  postClearCachesMessage: vi.fn(),
}));
vi.mock('@/lib/pwa/swClient', () => swClient);

import { AuthProvider, useAuth } from '../AuthContext';

const USER = { id: 'u1', email: 'a@b.c', name: 'Ana', role: 'user' as const };
const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

let replace: ReturnType<typeof vi.fn>;
const originalLocation = window.location;

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  swClient.clearAppCaches.mockClear();
  swClient.postClearCachesMessage.mockClear();
  replace = vi.fn();
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, replace },
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Object.defineProperty(window, 'location', { value: originalLocation, configurable: true });
});

describe('AuthContext — logout', () => {
  it('limpa os caches do app, avisa o service worker e faz replace para /signin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => mockFetchResponse(url === '/api/auth/me' ? USER : {})),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.id).toBe('u1'));

    await act(async () => {
      await result.current.logout();
    });

    expect(swClient.clearAppCaches).toHaveBeenCalledTimes(1);
    expect(swClient.postClearCachesMessage).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/signin');
    expect(result.current.user).toBeNull();
  });

  it('mesmo com erro de rede no logout, limpa os caches e redireciona', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/auth/logout') throw new Error('offline');
        return mockFetchResponse(USER);
      }),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.id).toBe('u1'));

    await act(async () => {
      await result.current.logout();
    });

    expect(swClient.clearAppCaches).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/signin');
  });
});

describe('AuthContext — revalidação ao voltar do segundo plano', () => {
  it('só revalida (em silêncio) depois de mais de 6h desde a última checagem', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn(async () => mockFetchResponse(USER));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.id).toBe('u1'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // voltou logo: não revalida
    act(() => setVisibility('visible'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // voltou depois de 6h+: revalida sem ligar o isLoading
    vi.setSystemTime(Date.now() + 6 * 60 * 60 * 1000 + 1000);
    act(() => setVisibility('visible'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.isLoading).toBe(false);
    await waitFor(() => expect(result.current.user?.id).toBe('u1'));
  });

  it('checkAuth silencioso sem rede mantém o usuário logado', async () => {
    const fetchMock = vi.fn(async () => mockFetchResponse(USER));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.id).toBe('u1'));

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await act(async () => {
      await result.current.checkAuth({ silent: true });
    });

    expect(result.current.user?.id).toBe('u1');
    expect(result.current.error).toBeNull();
  });
});
