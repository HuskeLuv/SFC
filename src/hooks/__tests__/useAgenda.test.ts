// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor, act } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';

const mockCsrfFetch = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useCsrf', () => ({
  useCsrf: () => ({ csrfFetch: mockCsrfFetch, getCsrfToken: vi.fn() }),
}));

import { useAgenda, useCriarEvento, useExcluirEvento } from '../useAgenda';

beforeEach(() => {
  vi.restoreAllMocks();
  mockCsrfFetch.mockReset();
});

describe('useAgenda', () => {
  it('não busca sem período; busca com de/ate e devolve a resposta', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse({
        eventos: [{ id: 'x' }],
        periodo: { de: '2026-09-01', ate: '2026-09-30' },
        fontesComErro: [],
      }),
    );
    const parado = renderHookWithClient(() => useAgenda(null));
    expect(parado.result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();

    const { result } = renderHookWithClient(() =>
      useAgenda({ de: '2026-09-01', ate: '2026-09-30' }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/calendar?de=2026-09-01&ate=2026-09-30',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(result.current.data?.eventos).toEqual([{ id: 'x' }]);
  });

  it('erro da API vira Error com a mensagem do servidor', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse({ error: 'Período inválido' }, 400),
    );
    const { result } = renderHookWithClient(() =>
      useAgenda({ de: '2026-09-01', ate: '2026-09-30' }),
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Período inválido');
  });
});

describe('mutations', () => {
  it('criar faz POST com csrf e devolve o evento; excluir faz DELETE', async () => {
    mockCsrfFetch.mockResolvedValueOnce(
      mockFetchResponse({ evento: { id: 'e1', titulo: 'Seguro' } }, 201),
    );
    const { result } = renderHookWithClient(() => useCriarEvento());
    let criado: unknown;
    await act(async () => {
      criado = await result.current.mutateAsync({ titulo: 'Seguro', data: '2026-09-25' });
    });
    expect(criado).toEqual({ id: 'e1', titulo: 'Seguro' });
    expect(mockCsrfFetch).toHaveBeenCalledWith(
      '/api/calendar',
      expect.objectContaining({ method: 'POST' }),
    );

    mockCsrfFetch.mockResolvedValueOnce(mockFetchResponse({ ok: true }));
    const del = renderHookWithClient(() => useExcluirEvento());
    await act(async () => {
      await del.result.current.mutateAsync('e1');
    });
    expect(mockCsrfFetch).toHaveBeenCalledWith('/api/calendar/e1', { method: 'DELETE' });
  });

  it('erro do servidor na criação vira mensagem legível', async () => {
    mockCsrfFetch.mockResolvedValueOnce(
      mockFetchResponse({ error: 'Consultor não cria eventos na agenda do cliente.' }, 403),
    );
    const { result } = renderHookWithClient(() => useCriarEvento());
    await expect(
      act(() => result.current.mutateAsync({ titulo: 'x', data: '2026-09-25' })),
    ).rejects.toThrow('Consultor não cria');
  });
});
