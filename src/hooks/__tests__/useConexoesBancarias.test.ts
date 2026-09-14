// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';
import { mockFetchSequence, stubFetch } from '@/test/mocks/fetch';

vi.mock('@/hooks/useCsrf', () => ({
  useCsrf: () => ({
    csrfFetch: (input: RequestInfo, init?: RequestInit) =>
      fetch(input, { ...init, headers: { ...(init?.headers ?? {}), 'x-csrf-token': 't' } }),
    getCsrfToken: () => 't',
  }),
}));

import {
  ConexaoApiError,
  useConexoes,
  usePluggyConfig,
  useRegistrarConexao,
} from '../useConexoesBancarias';

const conexao = {
  id: 'conn-1',
  connectorName: 'Pluggy Bank',
  status: 'UPDATED',
  accounts: [],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useConexoesBancarias', () => {
  it('usePluggyConfig devolve desligado quando a API falha', async () => {
    stubFetch({ error: 'x' }, 500);
    const { result } = renderHookWithClient(() => usePluggyConfig());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ habilitado: false, incluiSandbox: false });
  });

  it('useConexoes lista e expõe o status HTTP no erro (503 = desligado)', async () => {
    stubFetch({ connections: [conexao] });
    const { result } = renderHookWithClient(() => useConexoes());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].connectorName).toBe('Pluggy Bank');

    stubFetch({ error: 'Integração bancária desabilitada' }, 503);
    const { result: r2 } = renderHookWithClient(() => useConexoes());
    await waitFor(() => expect(r2.current.isError).toBe(true));
    expect(r2.current.error).toBeInstanceOf(ConexaoApiError);
    expect(r2.current.error?.status).toBe(503);
    expect(r2.current.error?.message).toBe('Integração bancária desabilitada');
  });

  it('useRegistrarConexao envia o itemId com CSRF e invalida a lista', async () => {
    const fetchMock = mockFetchSequence([
      { data: { connections: [] } },
      { data: { connection: conexao }, status: 201 },
      { data: { connections: [conexao] } },
    ]);
    vi.stubGlobal('fetch', fetchMock);
    const { result, queryClient } = renderHookWithClient(() => ({
      lista: useConexoes(),
      registrar: useRegistrarConexao(),
    }));
    await waitFor(() => expect(result.current.lista.isSuccess).toBe(true));
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.registrar.mutateAsync({
        itemId: '42c732c2-b234-4805-9674-cc529eb3a123',
      });
    });

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/pluggy/connections');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      itemId: '42c732c2-b234-4805-9674-cc529eb3a123',
    });
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('t');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['pluggy', 'conexoes'] });
  });
});
