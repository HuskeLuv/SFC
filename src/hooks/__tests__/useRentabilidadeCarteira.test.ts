// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';
import { useRentabilidadeCarteira } from '../useRentabilidadeCarteira';

const jsonOk = (body: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(body) });

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useRentabilidadeCarteira', () => {
  it('não busca quando disabled (enabled=false)', () => {
    const fetchMock = jsonOk({});
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHookWithClient(() => useRentabilidadeCarteira(false));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.rentabilidadeAA).toBeNull();
  });

  it('extrai fromBegin.portfolioMwrAnnualized arredondado (1 casa)', async () => {
    const fetchMock = jsonOk({ janelas: { fromBegin: { portfolioMwrAnnualized: 12.34 } } });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHookWithClient(() => useRentabilidadeCarteira(true));

    await waitFor(() => expect(result.current.rentabilidadeAA).toBe(12.3));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/analises/rentabilidade-janelas',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('retorna null quando o campo não existe', async () => {
    vi.stubGlobal('fetch', jsonOk({ janelas: { fromBegin: {} } }));

    const { result } = renderHookWithClient(() => useRentabilidadeCarteira(true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rentabilidadeAA).toBeNull();
  });

  it('retorna null em erro 5xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) }),
    );

    const { result } = renderHookWithClient(() => useRentabilidadeCarteira(true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rentabilidadeAA).toBeNull();
  });
});
