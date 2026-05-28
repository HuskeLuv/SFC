// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import {
  useObjetivos,
  useCreateObjetivo,
  useUpdateObjetivo,
  useDeleteObjetivo,
  useCreateEntry,
  useDeleteEntry,
  type PlanejamentoObjetivoDTO,
} from '@/hooks/usePlanejamentoSonhos';

const mockCsrfFetch = vi.fn();
const mockGetCsrfToken = vi.fn();

vi.mock('@/hooks/useCsrf', () => ({
  useCsrf: () => ({ csrfFetch: mockCsrfFetch, getCsrfToken: mockGetCsrfToken }),
}));

const sampleObjetivo: PlanejamentoObjetivoDTO = {
  id: 'g1',
  name: 'Reserva',
  target: 25000,
  months: 12,
  startDate: '2026-01',
  available: 5000,
  rate: 0.01,
  priority: 'Alta',
  category: 'c',
  status: 'Iniciado',
  notes: null,
  entries: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function stubGlobalFetch(data: unknown, status = 200) {
  const mock = vi.fn().mockResolvedValue(mockFetchResponse(data, status));
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('usePlanejamentoSonhos hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('useObjetivos', () => {
    it('fetches list and exposes objetivos array', async () => {
      const fetchMock = stubGlobalFetch({ objetivos: [sampleObjetivo] });
      const { result } = renderHookWithClient(() => useObjetivos());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/planejamento-sonhos',
        expect.objectContaining({ credentials: 'include' }),
      );
      expect(result.current.objetivos).toEqual([sampleObjetivo]);
      expect(result.current.error).toBeNull();
    });

    it('returns empty list (tolerant) on 404 while F3.2 endpoints not ready', async () => {
      stubGlobalFetch({}, 404);
      const { result } = renderHookWithClient(() => useObjetivos());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.objetivos).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it('exposes error on 401', async () => {
      stubGlobalFetch({}, 401);
      const { result } = renderHookWithClient(() => useObjetivos());

      await waitFor(() => expect(result.current.error).not.toBeNull());

      expect(result.current.objetivos).toEqual([]);
      expect(result.current.error).toMatch(/401/);
    });
  });

  describe('useCreateObjetivo', () => {
    it('POSTs to /api/planejamento-sonhos and returns created DTO', async () => {
      mockCsrfFetch.mockResolvedValueOnce(mockFetchResponse({ objetivo: sampleObjetivo }, 201));
      const { result } = renderHookWithClient(() => useCreateObjetivo());

      const created = await result.current.mutateAsync({
        name: 'Reserva',
        target: 25000,
        months: 12,
        startDate: '2026-01',
        available: 5000,
        rate: 0.01,
        priority: 'Alta',
        category: 'c',
        status: 'Iniciado',
        notes: null,
      });

      expect(created).toEqual(sampleObjetivo);
      expect(mockCsrfFetch).toHaveBeenCalledWith(
        '/api/planejamento-sonhos',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws on non-ok response', async () => {
      mockCsrfFetch.mockResolvedValueOnce(mockFetchResponse({ error: 'bad' }, 400));
      const { result } = renderHookWithClient(() => useCreateObjetivo());

      await expect(
        result.current.mutateAsync({
          name: 'X',
          target: 1,
          months: 1,
          startDate: null,
          available: 0,
          rate: 0,
          priority: 'Baixa',
          category: 'c',
          status: 'Em espera',
          notes: null,
        }),
      ).rejects.toThrow();
    });
  });

  describe('useUpdateObjetivo', () => {
    it('PATCHes to /api/planejamento-sonhos/:id with payload', async () => {
      const updated = { ...sampleObjetivo, name: 'Atualizado' };
      mockCsrfFetch.mockResolvedValueOnce(mockFetchResponse({ objetivo: updated }));
      const { result } = renderHookWithClient(() => useUpdateObjetivo());

      const out = await result.current.mutateAsync({
        id: 'g1',
        payload: {
          name: 'Atualizado',
          target: 25000,
          months: 12,
          startDate: '2026-01',
          available: 5000,
          rate: 0.01,
          priority: 'Alta',
          category: 'c',
          status: 'Iniciado',
          notes: null,
        },
      });

      expect(out.name).toBe('Atualizado');
      expect(mockCsrfFetch).toHaveBeenCalledWith(
        '/api/planejamento-sonhos/g1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('useDeleteObjetivo', () => {
    it('DELETEs to /api/planejamento-sonhos/:id', async () => {
      mockCsrfFetch.mockResolvedValueOnce(mockFetchResponse({}, 204));
      const { result } = renderHookWithClient(() => useDeleteObjetivo());

      await result.current.mutateAsync('g1');

      expect(mockCsrfFetch).toHaveBeenCalledWith(
        '/api/planejamento-sonhos/g1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('useCreateEntry', () => {
    it('POSTs entry to /api/planejamento-sonhos/:id/entries', async () => {
      mockCsrfFetch.mockResolvedValueOnce(mockFetchResponse({ objetivo: sampleObjetivo }));
      const { result } = renderHookWithClient(() => useCreateEntry('g1'));

      await result.current.mutateAsync({ month: '2026-02', aporte: 1500, balance: 6500 });

      expect(mockCsrfFetch).toHaveBeenCalledWith(
        '/api/planejamento-sonhos/g1/entries',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ month: '2026-02', aporte: 1500, balance: 6500 }),
        }),
      );
    });
  });

  describe('useDeleteEntry', () => {
    it('DELETEs entry encoding month in URL', async () => {
      mockCsrfFetch.mockResolvedValueOnce(mockFetchResponse({}, 204));
      const { result } = renderHookWithClient(() => useDeleteEntry('g1'));

      await result.current.mutateAsync('2026-02');

      expect(mockCsrfFetch).toHaveBeenCalledWith(
        '/api/planejamento-sonhos/g1/entries/2026-02',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});
