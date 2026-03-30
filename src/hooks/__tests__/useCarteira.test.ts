// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';
import { mockFetchResponse, mockFetchSequence } from '@/test/mocks/fetch';

const mockCsrfFetch = vi.fn();

vi.mock('@/hooks/useCsrf', () => ({
  useCsrf: () => ({ csrfFetch: mockCsrfFetch, getCsrfToken: vi.fn() }),
}));

import { useCarteira } from '../useCarteira';

const mockResumo = {
  saldoBruto: 100000,
  valorAplicado: 80000,
  rentabilidade: 25,
  metaPatrimonio: 500000,
  caixaParaInvestir: 5000,
  historicoPatrimonio: [],
  distribuicao: {
    reservaEmergencia: { valor: 10000, percentual: 10 },
    reservaOportunidade: { valor: 5000, percentual: 5 },
    rendaFixaFundos: { valor: 20000, percentual: 20 },
    fimFia: { valor: 0, percentual: 0 },
    fiis: { valor: 15000, percentual: 15 },
    acoes: { valor: 20000, percentual: 20 },
    stocks: { valor: 10000, percentual: 10 },
    reits: { valor: 5000, percentual: 5 },
    etfs: { valor: 5000, percentual: 5 },
    moedasCriptos: { valor: 5000, percentual: 5 },
    previdenciaSeguros: { valor: 3000, percentual: 3 },
    opcoes: { valor: 1000, percentual: 1 },
    imoveisBens: { valor: 1000, percentual: 1 },
  },
  portfolioDetalhes: {
    totalAcoes: 20000,
    totalInvestimentos: 100000,
    stocksTotalInvested: 8000,
    stocksCurrentValue: 10000,
    otherInvestmentsTotalInvested: 72000,
    otherInvestmentsCurrentValue: 90000,
  },
};

const mockResumoFull = {
  ...mockResumo,
  historicoPatrimonio: [{ data: 1700000000, valorAplicado: 80000, saldoBruto: 100000 }],
};

beforeEach(() => {
  vi.restoreAllMocks();
  mockCsrfFetch.mockReset();
});

describe('useCarteira', () => {
  describe('progressive loading', () => {
    it('fetches fast summary first (includeHistorico=false)', async () => {
      const fetchMock = mockFetchSequence([{ data: mockResumo }, { data: mockResumoFull }]);
      vi.stubGlobal('fetch', fetchMock);

      renderHookWithClient(() => useCarteira());

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/carteira/resumo?includeHistorico=false',
          expect.objectContaining({ method: 'GET', credentials: 'include' }),
        );
      });
    });

    it('then fetches full data with history', async () => {
      const fetchMock = mockFetchSequence([{ data: mockResumo }, { data: mockResumoFull }]);
      vi.stubGlobal('fetch', fetchMock);

      renderHookWithClient(() => useCarteira());

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/carteira/resumo',
          expect.objectContaining({ method: 'GET', credentials: 'include' }),
        );
      });
    });

    it('returns fast data if full fetch fails', async () => {
      const fetchMock = mockFetchSequence([{ data: mockResumo }, { data: {}, status: 500 }]);
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHookWithClient(() => useCarteira());

      await waitFor(() => {
        expect(result.current.resumo).not.toBeNull();
      });

      expect(result.current.resumo?.saldoBruto).toBe(100000);
      expect(result.current.resumo?.historicoPatrimonio).toEqual([]);
    });
  });

  describe('resumo data', () => {
    it('returns resumo data after successful fetch', async () => {
      const fetchMock = mockFetchSequence([{ data: mockResumo }, { data: mockResumoFull }]);
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHookWithClient(() => useCarteira());

      await waitFor(() => {
        expect(result.current.resumo).not.toBeNull();
      });

      expect(result.current.resumo?.valorAplicado).toBe(80000);
      expect(result.current.resumo?.distribuicao.acoes.valor).toBe(20000);
    });
  });

  describe('error handling', () => {
    it('sets error on fetch failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse({}, 500)));

      const { result } = renderHookWithClient(() => useCarteira());

      await waitFor(() => {
        expect(result.current.error).toBe('Erro ao carregar dados da carteira');
      });
    });
  });

  describe('updateMeta', () => {
    it('POSTs metaPatrimonio via csrfFetch', async () => {
      const fetchMock = mockFetchSequence([{ data: mockResumo }, { data: mockResumoFull }]);
      vi.stubGlobal('fetch', fetchMock);
      mockCsrfFetch.mockResolvedValue(mockFetchResponse({ success: true }));

      const { result } = renderHookWithClient(() => useCarteira());

      await waitFor(() => {
        expect(result.current.resumo).not.toBeNull();
      });

      const success = await result.current.updateMeta(1000000);

      expect(success).toBe(true);
      expect(mockCsrfFetch).toHaveBeenCalledWith('/api/carteira/resumo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metaPatrimonio: 1000000 }),
      });
    });

    it('returns false on failure', async () => {
      const fetchMock = mockFetchSequence([{ data: mockResumo }, { data: mockResumoFull }]);
      vi.stubGlobal('fetch', fetchMock);
      mockCsrfFetch.mockResolvedValue(mockFetchResponse({}, 500));

      const { result } = renderHookWithClient(() => useCarteira());

      await waitFor(() => {
        expect(result.current.resumo).not.toBeNull();
      });

      const success = await result.current.updateMeta(1000000);
      expect(success).toBe(false);
    });
  });

  describe('updateCaixaParaInvestir', () => {
    it('optimistically updates caixaParaInvestir in cache', async () => {
      const fetchMock = mockFetchSequence([{ data: mockResumo }, { data: mockResumoFull }]);
      vi.stubGlobal('fetch', fetchMock);

      // csrfFetch will hang so we can observe the optimistic update
      let resolveCsrf!: (v: Response) => void;
      mockCsrfFetch.mockReturnValue(
        new Promise<Response>((r) => {
          resolveCsrf = r;
        }),
      );

      const { result } = renderHookWithClient(() => useCarteira());

      await waitFor(() => {
        expect(result.current.resumo).not.toBeNull();
      });

      // Fire the update (don't await yet)
      const promise = result.current.updateCaixaParaInvestir(9999);

      // Optimistic value should appear immediately
      await waitFor(() => {
        expect(result.current.resumo?.caixaParaInvestir).toBe(9999);
      });

      resolveCsrf(mockFetchResponse({ success: true }));
      const success = await promise;
      expect(success).toBe(true);
    });

    it('calls csrfFetch with caixaParaInvestir payload', async () => {
      const fetchMock = mockFetchSequence([{ data: mockResumo }, { data: mockResumoFull }]);
      vi.stubGlobal('fetch', fetchMock);
      mockCsrfFetch.mockResolvedValue(mockFetchResponse({ success: true }));

      const { result } = renderHookWithClient(() => useCarteira());

      await waitFor(() => {
        expect(result.current.resumo).not.toBeNull();
      });

      await result.current.updateCaixaParaInvestir(7000);

      expect(mockCsrfFetch).toHaveBeenCalledWith('/api/carteira/resumo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caixaParaInvestir: 7000 }),
      });
    });

    it('rolls back on error', async () => {
      const fetchMock = mockFetchSequence([{ data: mockResumo }, { data: mockResumoFull }]);
      vi.stubGlobal('fetch', fetchMock);
      mockCsrfFetch.mockResolvedValue(mockFetchResponse({}, 500));

      const { result } = renderHookWithClient(() => useCarteira());

      await waitFor(() => {
        expect(result.current.resumo).not.toBeNull();
      });

      const success = await result.current.updateCaixaParaInvestir(9999);

      expect(success).toBe(false);
      // Should roll back to original value
      await waitFor(() => {
        expect(result.current.resumo?.caixaParaInvestir).toBe(mockResumoFull.caixaParaInvestir);
      });
    });
  });

  describe('formatCurrency', () => {
    it('formats BRL currency correctly', async () => {
      const fetchMock = mockFetchSequence([{ data: mockResumo }, { data: mockResumoFull }]);
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHookWithClient(() => useCarteira());

      // formatCurrency is available immediately (no async dependency)
      expect(result.current.formatCurrency(1234.56)).toMatch(/R\$\s*1\.234,56/);
      expect(result.current.formatCurrency(null)).toBe('R$ 0,00');
      expect(result.current.formatCurrency(undefined)).toBe('R$ 0,00');
    });
  });

  describe('formatPercentage', () => {
    it('formats percentage with +/- prefix', async () => {
      const fetchMock = mockFetchSequence([{ data: mockResumo }, { data: mockResumoFull }]);
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHookWithClient(() => useCarteira());

      expect(result.current.formatPercentage(25)).toBe('+25.00%');
      expect(result.current.formatPercentage(-10.5)).toBe('-10.50%');
      expect(result.current.formatPercentage(0)).toBe('+0.00%');
      expect(result.current.formatPercentage(null)).toBe('0,00%');
    });
  });
});
