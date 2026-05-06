// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import { useAssetData, type AssetDataShape } from '@/hooks/useAssetData';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockCsrfFetch = vi.fn();
const mockGetCsrfToken = vi.fn();

vi.mock('@/hooks/useCsrf', () => ({
  useCsrf: () => ({ csrfFetch: mockCsrfFetch, getCsrfToken: mockGetCsrfToken }),
}));

// ── Fixtures ───────────────────────────────────────────────────────────────────

const config = {
  apiPath: '/api/carteira/acoes',
  objetivoPath: '/api/carteira/acoes/objetivo',
  label: 'Ações',
};

const mockAssetData: AssetDataShape = {
  secoes: [
    {
      ativos: [
        {
          id: 'ativo-1',
          objetivo: 10,
          valorAtualizado: 1000,
          percentualCarteira: 50,
          quantoFalta: -40,
          necessidadeAporte: 0,
        },
      ],
      totalObjetivo: 10,
      totalQuantoFalta: -40,
      totalNecessidadeAporte: 0,
    },
  ],
  totalGeral: {
    valorAtualizado: 2000,
    objetivo: 10,
    quantoFalta: -40,
    necessidadeAporte: 0,
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function stubGlobalFetch(data: unknown, status = 200) {
  const mock = vi.fn().mockResolvedValue(mockFetchResponse(data, status));
  vi.stubGlobal('fetch', mock);
  return mock;
}

function renderUseAssetData(overrides: Partial<typeof config> = {}) {
  return renderHookWithClient(() => useAssetData<AssetDataShape>({ ...config, ...overrides }));
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useAssetData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Query behavior ───────────────────────────────────────────────────────

  describe('query behavior', () => {
    it('fetches data from apiPath on mount', async () => {
      const fetchMock = stubGlobalFetch(mockAssetData);
      const { result } = renderUseAssetData();

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/carteira/acoes',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        }),
      );
      expect(result.current.data).toEqual(mockAssetData);
    });

    it('sets loading=true initially then false after fetch', async () => {
      stubGlobalFetch(mockAssetData);
      const { result } = renderUseAssetData();

      expect(result.current.loading).toBe(true);

      await waitFor(() => expect(result.current.loading).toBe(false));
    });

    it('sets error message on fetch failure (non-ok response)', async () => {
      stubGlobalFetch({ error: 'fail' }, 500);
      const { result } = renderUseAssetData();

      await waitFor(() => expect(result.current.error).toBeTruthy());

      expect(result.current.error).toBe('Erro ao carregar dados Ações');
    });

    it('returns null data initially', () => {
      stubGlobalFetch(mockAssetData);
      const { result } = renderUseAssetData();

      expect(result.current.data).toBeNull();
    });

    it('refetch triggers new fetch', async () => {
      const fetchMock = stubGlobalFetch(mockAssetData);
      const { result } = renderUseAssetData();

      await waitFor(() => expect(result.current.loading).toBe(false));

      const callCountBefore = fetchMock.mock.calls.length;
      await result.current.refetch();

      expect(fetchMock.mock.calls.length).toBeGreaterThan(callCountBefore);
    });
  });

  // ── updateObjetivo optimistic update ─────────────────────────────────────

  describe('updateObjetivo optimistic update', () => {
    it('immediately updates cache with new objetivo value', async () => {
      stubGlobalFetch(mockAssetData);
      mockCsrfFetch.mockResolvedValue(mockFetchResponse({}, 200));

      const { result } = renderUseAssetData();
      await waitFor(() => expect(result.current.data).toEqual(mockAssetData));

      await result.current.updateObjetivo('ativo-1', 25);

      await waitFor(() => {
        expect(result.current.data!.secoes[0].ativos[0].objetivo).toBe(25);
      });
    });

    it('recalculates percentualCarteira based on totalGeral.valorAtualizado', async () => {
      stubGlobalFetch(mockAssetData);
      mockCsrfFetch.mockResolvedValue(mockFetchResponse({}, 200));

      const { result } = renderUseAssetData();
      await waitFor(() => expect(result.current.data).toEqual(mockAssetData));

      await result.current.updateObjetivo('ativo-1', 25);

      await waitFor(() => {
        // percentualCarteira = (1000 / 2000) * 100 = 50
        expect(result.current.data!.secoes[0].ativos[0].percentualCarteira).toBe(50);
      });
    });

    it('recalculates quantoFalta (objetivo - percentualCarteira)', async () => {
      stubGlobalFetch(mockAssetData);
      mockCsrfFetch.mockResolvedValue(mockFetchResponse({}, 200));

      const { result } = renderUseAssetData();
      await waitFor(() => expect(result.current.data).toEqual(mockAssetData));

      await result.current.updateObjetivo('ativo-1', 25);

      await waitFor(() => {
        // quantoFalta = 25 - 50 = -25
        expect(result.current.data!.secoes[0].ativos[0].quantoFalta).toBe(-25);
      });
    });

    it('recalculates necessidadeAporte', async () => {
      stubGlobalFetch(mockAssetData);
      mockCsrfFetch.mockResolvedValue(mockFetchResponse({}, 200));

      const { result } = renderUseAssetData();
      await waitFor(() => expect(result.current.data).toEqual(mockAssetData));

      // With objetivo=25 and percentualCarteira=50, quantoFalta=-25 (negative),
      // so necessidadeAporte should be 0
      await result.current.updateObjetivo('ativo-1', 25);

      await waitFor(() => {
        expect(result.current.data!.secoes[0].ativos[0].necessidadeAporte).toBe(0);
      });

      // Now test with objetivo > percentualCarteira to get positive necessidadeAporte
      // objetivo=80, percentualCarteira=50, quantoFalta=30
      // necessidadeAporte = (30/100) * 2000 = 600
      await result.current.updateObjetivo('ativo-1', 80);

      await waitFor(() => {
        expect(result.current.data!.secoes[0].ativos[0].necessidadeAporte).toBe(600);
      });
    });

    it('rolls back on server error (csrfFetch rejects)', async () => {
      stubGlobalFetch(mockAssetData);
      mockCsrfFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderUseAssetData();
      await waitFor(() => expect(result.current.data).toEqual(mockAssetData));

      const returnValue = await result.current.updateObjetivo('ativo-1', 25);

      expect(returnValue).toBe(false);

      // Should roll back to original objetivo
      await waitFor(() => {
        expect(result.current.data!.secoes[0].ativos[0].objetivo).toBe(10);
      });
    });

    it('throwOnError=true mode throws instead of returning false', async () => {
      stubGlobalFetch(mockAssetData);
      mockCsrfFetch.mockRejectedValueOnce(new Error('Server error'));

      const { result } = renderUseAssetData({ throwOnError: true } as never);
      await waitFor(() => expect(result.current.data).toEqual(mockAssetData));

      await expect(result.current.updateObjetivo('ativo-1', 25)).rejects.toThrow('Server error');
    });
  });

  // ── Formatting ───────────────────────────────────────────────────────────

  describe('formatting', () => {
    it('formatCurrency BRL format', async () => {
      stubGlobalFetch(mockAssetData);
      const { result } = renderUseAssetData();

      await waitFor(() => expect(result.current.loading).toBe(false));

      const formatted = result.current.formatCurrency(1234.56);
      // BRL format: R$ 1.234,56
      expect(formatted).toContain('R$');
      expect(formatted).toContain('1.234,56');
    });

    it('formatCurrency USD format', async () => {
      stubGlobalFetch(mockAssetData);
      const { result } = renderUseAssetData({ currency: 'USD' } as never);

      await waitFor(() => expect(result.current.loading).toBe(false));

      const formatted = result.current.formatCurrency(1234.56);
      expect(formatted).toContain('$');
      expect(formatted).toContain('1,234.56');
    });

    it('formatPercentage handles null/undefined', async () => {
      stubGlobalFetch(mockAssetData);
      const { result } = renderUseAssetData();

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.formatPercentage(null)).toBe('0,00%');
      expect(result.current.formatPercentage(undefined)).toBe('0,00%');
      expect(result.current.formatPercentage(12.345)).toBe('12.35%');
    });

    it('formatNumber handles null', async () => {
      stubGlobalFetch(mockAssetData);
      const { result } = renderUseAssetData();

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.formatNumber(null)).toBe('0');
      expect(result.current.formatNumber(1234)).toBeTruthy();
    });
  });
});
