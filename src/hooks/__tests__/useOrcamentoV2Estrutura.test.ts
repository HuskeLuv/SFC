// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import { queryKeys } from '@/lib/queryKeys';
import { ErroExclusaoV2, useOrcamentoV2Estrutura } from '../useOrcamentoV2Estrutura';

vi.mock('@/hooks/useCsrf', () => ({
  useCsrf: () => ({
    csrfFetch: (url: string, init?: RequestInit) => fetch(url, { ...init, credentials: 'include' }),
  }),
  getCsrfToken: () => 'csrf',
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const corpo = (i: number) => JSON.parse(String(fetchMock.mock.calls[i][1].body));

describe('useOrcamentoV2Estrutura', () => {
  it('criar: POST /api/cashflow/items (rota da Planilha) e recarrega o v2', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ id: 'it-1' }));
    const { result, queryClient } = renderHookWithClient(() => useOrcamentoV2Estrutura(2026));
    const inval = vi.spyOn(queryClient, 'invalidateQueries');
    await act(() => result.current.criar.mutateAsync({ categoriaId: 'cat-1', nome: 'Feira' }));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/cashflow/items');
    expect(corpo(0)).toMatchObject({ groupId: 'cat-1', name: 'Feira' });
    expect(inval).toHaveBeenCalledWith({ queryKey: queryKeys.cashflow.orcamentoV2Todos() });
    expect(inval).toHaveBeenCalledWith({ queryKey: queryKeys.cashflow.year(2026) });
  });

  it('criar recusado (422 das guardas) lança a mensagem do servidor', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse({ error: 'Já existe uma subcategoria com esse nome' }, 422),
    );
    const { result } = renderHookWithClient(() => useOrcamentoV2Estrutura(2026));
    await expect(
      act(() => result.current.criar.mutateAsync({ categoriaId: 'c', nome: 'X' })),
    ).rejects.toThrow('Já existe uma subcategoria com esse nome');
  });

  it('renomear: PUT batch-update com updates[].name; recusa parcial vira erro', async () => {
    fetchMock
      .mockResolvedValueOnce(mockFetchResponse({ results: [{ itemId: 'i', success: true }] }))
      .mockResolvedValueOnce(
        mockFetchResponse({
          results: [
            { itemId: 'i', success: false, error: 'A subcategoria Geral não pode ser renomeada' },
          ],
        }),
      );
    const { result } = renderHookWithClient(() => useOrcamentoV2Estrutura(2026));
    await act(() =>
      result.current.renomear.mutateAsync({ categoriaId: 'c', itemId: 'i', nome: 'Novo' }),
    );
    expect(fetchMock.mock.calls[0][0]).toBe('/api/cashflow/batch-update');
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    expect(corpo(0)).toEqual({
      groupId: 'c',
      year: 2026,
      updates: [{ itemId: 'i', name: 'Novo' }],
      deletes: [],
    });
    await expect(
      act(() => result.current.renomear.mutateAsync({ categoriaId: 'c', itemId: 'i', nome: 'N' })),
    ).rejects.toThrow('A subcategoria Geral não pode ser renomeada');
  });

  it('impacto e excluir: GET .../impacto e DELETE; 409 cores_divergentes traz os meses', async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockFetchResponse({
          itemId: 'i',
          nome: 'Bar',
          celulas: 7,
          transacoes: 0,
          mesesComOrcado: 1,
          coresDivergentes: [],
        }),
      )
      .mockResolvedValueOnce(
        mockFetchResponse({ celulasMovidas: 7, celulasSomadas: 0, transacoesMovidas: 0 }),
      )
      .mockResolvedValueOnce(
        mockFetchResponse(
          {
            error: 'Cores divergentes',
            codigo: 'cores_divergentes',
            meses: [{ ano: 2026, mes: 9 }],
          },
          409,
        ),
      );
    const { result, queryClient } = renderHookWithClient(() => useOrcamentoV2Estrutura(2026));
    const inval = vi.spyOn(queryClient, 'invalidateQueries');

    const impacto = await result.current.buscarImpacto('i');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/cashflow/orcamento/v2/subcategorias/i/impacto');
    expect(impacto.celulas).toBe(7);

    await act(() => result.current.excluir.mutateAsync({ itemId: 'i' }));
    expect(fetchMock.mock.calls[1][0]).toBe('/api/cashflow/orcamento/v2/subcategorias/i');
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
    expect(inval).toHaveBeenCalledWith({ queryKey: queryKeys.cashflow.all });

    let erro: unknown;
    await act(async () => {
      erro = await result.current.excluir.mutateAsync({ itemId: 'i' }).catch((e) => e);
    });
    expect(erro).toBeInstanceOf(ErroExclusaoV2);
    expect((erro as ErroExclusaoV2).codigo).toBe('cores_divergentes');
    expect((erro as ErroExclusaoV2).meses).toEqual([{ ano: 2026, mes: 9 }]);
  });
});
