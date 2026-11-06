// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { QueryObserver } from '@tanstack/react-query';
import { renderHookWithClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import { queryKeys } from '@/lib/queryKeys';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';
import { useRelatorioFinanceiro } from '../useRelatorioFinanceiro';
import { useRelatorioFinanceiroConfig } from '../useRelatorioFinanceiroConfig';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useRelatorioFinanceiro', () => {
  it('busca o período pedido com credentials e guarda na chave por meses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ versao: 1, plano: 'adv' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result, queryClient } = renderHookWithClient(() => useRelatorioFinanceiro(6));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/relatorios/financeiro?meses=6',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(queryClient.getQueryData(queryKeys.relatorios.financeiro(6))).toEqual({
      versao: 1,
      plano: 'adv',
    });
    expect(queryKeys.relatorios.financeiro(6)).toEqual(['relatorios', 'financeiro', 6]);
  });

  it('refaz ao montar de novo (refetchOnMount always, staleTime 0)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ versao: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result, queryClient } = renderHookWithClient(() => useRelatorioFinanceiro(1));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const query = queryClient
      .getQueryCache()
      .find({ queryKey: queryKeys.relatorios.financeiro(1) });
    const opcoes = query?.observers[0]?.options;
    expect(opcoes?.refetchOnMount).toBe('always');
    expect(opcoes?.staleTime).toBe(0);

    // Um 2º observador (nova abertura da página) com os dados já em cache: busca de novo.
    const obs = new QueryObserver(queryClient, {
      queryKey: queryKeys.relatorios.financeiro(1),
      refetchOnMount: 'always',
      staleTime: 0,
    });
    const unsub = obs.subscribe(() => {});
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    unsub();
  });

  it('erro HTTP vira erro da query', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse({}, 500)));
    const { result } = renderHookWithClient(() => useRelatorioFinanceiro(1));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Erro ao gerar o relatório financeiro');
  });

  it('enabled=false não busca (modo demonstração)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHookWithClient(() => useRelatorioFinanceiro(1, { enabled: false }));
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('invalidatePortfolioDerivedQueries inclui os relatórios', () => {
    const invalidate = vi.fn();
    invalidatePortfolioDerivedQueries({ invalidateQueries: invalidate } as never);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['relatorios'] });
  });
});

describe('useRelatorioFinanceiroConfig', () => {
  it('lê a chave com credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ habilitado: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHookWithClient(() => useRelatorioFinanceiroConfig());
    await waitFor(() => expect(result.current.data).toEqual({ habilitado: true }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/relatorios/financeiro/config',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('404 = desligado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse({}, 404)));
    const { result } = renderHookWithClient(() => useRelatorioFinanceiroConfig());
    await waitFor(() => expect(result.current.data).toEqual({ habilitado: false }));
  });
});
