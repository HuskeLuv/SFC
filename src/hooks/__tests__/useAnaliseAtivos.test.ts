// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import { queryKeys } from '@/lib/queryKeys';
import {
  CONFIG_DESLIGADA,
  paramsQuadroParaQuery,
  prefetchAtivoTopo,
  useAnaliseAtivosConfig,
  useAtivoTopo,
  useFundamentosAtivo,
  useQuadroAnalise,
  useSalvarTese,
  useTese,
} from '@/hooks/useAnaliseAtivos';
import {
  ATIVO_WEGE3,
  CONFIG_LIBERADA,
  QUADRO_ACOES,
  TESE_VAZIA,
} from '@/test/fixtures/analiseAtivos/respostas';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  document.cookie = 'csrf-token=tok123';
});
afterEach(() => vi.unstubAllGlobals());

describe('queryKeys.analiseAtivos', () => {
  it('keys estáveis e aninhadas por ticker', () => {
    expect(queryKeys.analiseAtivos.config()).toEqual(['analiseAtivos', 'config']);
    expect(queryKeys.analiseAtivos.ativo('WEGE3')).toEqual(['analiseAtivos', 'ativo', 'WEGE3']);
    expect(queryKeys.analiseAtivos.fundamentos('WEGE3').slice(0, 3)).toEqual(
      queryKeys.analiseAtivos.ativo('WEGE3'),
    );
    expect(queryKeys.analiseAtivos.quadro({ classe: 'acao' })[1]).toBe('quadro');
    expect(queryKeys.analiseAtivos.tese('WEGE3')).toEqual(['analiseAtivos', 'tese', 'WEGE3']);
  });
});

describe('paramsQuadroParaQuery', () => {
  it('booleanos como 1, falsos e vazios omitidos, ordem estável', () => {
    const qs = paramsQuadroParaQuery({
      classe: 'acao',
      ordem: 'pl',
      lucroConsistente: true,
      naCarteira: false,
      setor: '',
      offset: 25,
      limite: 25,
    });
    expect(qs.toString()).toBe('classe=acao&limite=25&lucroConsistente=1&offset=25&ordem=pl');
  });
});

describe('useAnaliseAtivosConfig', () => {
  it('lê a config', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(CONFIG_LIBERADA));
    const { result } = renderHookWithClient(() => useAnaliseAtivosConfig());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(CONFIG_LIBERADA);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/analise-ativos/config');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
  });

  it('falha (HTTP ou rede) = desligada', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({ error: 'x' }, 500));
    const { result } = renderHookWithClient(() => useAnaliseAtivosConfig());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(CONFIG_DESLIGADA);

    fetchMock.mockRejectedValue(new Error('rede'));
    const r2 = renderHookWithClient(() => useAnaliseAtivosConfig());
    await waitFor(() => expect(r2.result.current.isSuccess).toBe(true));
    expect(r2.result.current.data?.habilitada).toBe(false);
  });
});

describe('useQuadroAnalise', () => {
  it('pagina de 25 em 25 pelo offset', async () => {
    fetchMock
      .mockResolvedValueOnce(mockFetchResponse({ ...QUADRO_ACOES, total: 30 }))
      .mockResolvedValueOnce(
        mockFetchResponse({ ...QUADRO_ACOES, total: 30, offset: 4, itens: QUADRO_ACOES.itens }),
      );
    const { result } = renderHookWithClient(() => useQuadroAnalise({ classe: 'acao' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/analise-ativos/quadro?classe=acao&limite=25&offset=0',
    );
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(fetchMock.mock.calls[1][0]).toContain('offset=4');
  });

  it('enabled=false não busca', () => {
    renderHookWithClient(() => useQuadroAnalise({ classe: 'fii' }, { enabled: false }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useAtivoTopo e preguiçosos', () => {
  it('404 vira erro com status, sem retry', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({ error: 'Recurso não disponível' }, 404));
    const { result } = renderHookWithClient(() => useAtivoTopo('XXXX3'));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error & { status?: number }).status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fundamentos só com enabled', async () => {
    const { rerender } = renderHookWithClient(() =>
      useFundamentosAtivo('WEGE3', { enabled: false }),
    );
    rerender();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prefetchAtivoTopo popula o cache', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(ATIVO_WEGE3));
    const { queryClient } = renderHookWithClient(() => null);
    await prefetchAtivoTopo(queryClient, 'WEGE3');
    expect(queryClient.getQueryData(queryKeys.analiseAtivos.ativo('WEGE3'))).toEqual(ATIVO_WEGE3);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/analise-ativos/ativos/WEGE3');
  });
});

describe('tese', () => {
  it('useTese lê a tese do usuário', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(TESE_VAZIA));
    const { result } = renderHookWithClient(() => useTese('WEGE3'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(TESE_VAZIA);
  });

  it('useSalvarTese: PUT com CSRF; vazio vira DELETE; atualiza o cache', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ atualizadoEm: '2026-10-02T12:00:00Z' }));
    // useTese desligado mantém um observador (gcTime 0 no teste) para ler o cache
    const { result } = renderHookWithClient(() => ({
      salvar: useSalvarTese('WEGE3'),
      tese: useTese('WEGE3', { enabled: false }),
    }));
    await act(async () => {
      await result.current.salvar.mutateAsync({ corpo: 'minha tese' });
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/analise-ativos/teses/WEGE3');
    expect(init.method).toBe('PUT');
    expect(new Headers(init.headers).get('x-csrf-token')).toBe('tok123');
    expect(JSON.parse(init.body)).toEqual({ corpo: 'minha tese' });
    await waitFor(() => expect(result.current.tese.data?.corpo).toBe('minha tese'));
    expect(result.current.tese.data).toMatchObject({
      atualizadoEm: '2026-10-02T12:00:00Z',
    });

    fetchMock.mockResolvedValueOnce(mockFetchResponse({ ok: true }));
    await act(async () => {
      await result.current.salvar.mutateAsync({ corpo: '   ' });
    });
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
    await waitFor(() => expect(result.current.tese.data?.corpo).toBe(''));
    expect(result.current.tese.data).toMatchObject({
      corpo: '',
      atualizadoEm: null,
    });
  });

  it('erro 403 do consultor propaga a mensagem', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ error: 'A tese é pessoal' }, 403));
    const { result } = renderHookWithClient(() => useSalvarTese('WEGE3'));
    await expect(result.current.mutateAsync({ corpo: 'x' })).rejects.toThrow('A tese é pessoal');
  });
});
