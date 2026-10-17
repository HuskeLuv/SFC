// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import { queryKeys } from '@/lib/queryKeys';

const mocks = vi.hoisted(() => ({ csrfFetch: vi.fn() }));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: mocks.csrfFetch }) }));

import {
  ErroCarteira,
  aplicarAlvoNoOverlay,
  urlAlvo,
  useMutacoesCarteiraAnalise,
  usePosicaoCarteira,
  useSugestoesComparar,
} from '../useAcoesCarteiraAnalise';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mocks.csrfFetch.mockReset();
  fetchMock = vi.fn(async () => mockFetchResponse({ ticker: 'WEGE3', janela: 5, itens: [] }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('useSugestoesComparar', () => {
  it('GET com janela e q (aparado); key por ticker, janela e busca', async () => {
    const { result, queryClient } = renderHookWithClient(() =>
      useSugestoesComparar('wege3', 10, ' emb ', true),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/api/analise-ativos/ativos/WEGE3/comparar-sugestoes?janela=10&q=emb',
    );
    const chave = queryKeys.analiseAtivos.sugestoesComparar('WEGE3', 10, 'emb');
    expect(queryClient.getQueryData(chave)).toEqual({ ticker: 'WEGE3', janela: 5, itens: [] });
  });

  it('desabilitado (modal fechado): não busca', () => {
    renderHookWithClient(() => useSugestoesComparar('WEGE3', 5, '', false));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('usePosicaoCarteira', () => {
  it('GET /api/ativos/[portfolioId] só com o id', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({ posicao: { quantidade: 1 } }));
    const { result } = renderHookWithClient(() => usePosicaoCarteira('pf-1', true));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/ativos/pf-1');
    renderHookWithClient(() => usePosicaoCarteira(null, true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('Planejar = Objetivo da Carteira — helpers', () => {
  it('urlAlvo normaliza o ticker', () => {
    expect(urlAlvo(' wege3 ')).toBe('/api/analise-ativos/alvos/WEGE3');
  });

  const overlayBase = () => ({
    posicoes: {
      WEGE3: { portfolioId: 'p', quantidade: 1, categoria: 'acoes', objetivoPct: null },
    },
    planejados: {},
  });

  it('posição: grava e zera posicoes[t].objetivoPct', () => {
    const alvo = {
      origem: 'posicao' as const,
      id: 'p',
      objetivoPct: 15,
      categoria: 'acoes',
      abaNome: 'Ações',
      secao: 'value',
    };
    const com = aplicarAlvoNoOverlay(overlayBase(), 'wege3', alvo)!;
    expect(com.posicoes.WEGE3.objetivoPct).toBe(15);
    expect(aplicarAlvoNoOverlay(com, 'WEGE3', null)!.posicoes.WEGE3.objetivoPct).toBeNull();
    expect(aplicarAlvoNoOverlay(undefined, 'WEGE3', alvo)).toBeUndefined();
  });

  it('planejado: cria planejados[t] com a seção; remover tira a linha', () => {
    const alvo = {
      origem: 'planejado' as const,
      id: 'wl-afhi',
      objetivoPct: 10,
      categoria: 'fiis',
      abaNome: "FII's",
      secao: 'tvm',
    };
    const com = aplicarAlvoNoOverlay(overlayBase(), 'afhi11', alvo)!;
    expect(com.planejados.AFHI11).toEqual({
      watchlistId: 'wl-afhi',
      id: 'wl-afhi',
      categoria: 'fiis',
      objetivoPct: 10,
      secao: 'tvm',
    });
    expect(aplicarAlvoNoOverlay(com, 'AFHI11', null)!.planejados).toEqual({});
  });
});

describe('useMutacoesCarteiraAnalise', () => {
  it('compra: POST /api/carteira/operacao com CSRF (csrfFetch) e invalida a carteira', async () => {
    mocks.csrfFetch.mockResolvedValue(mockFetchResponse({ success: true }, 201));
    const { result, queryClient } = renderHookWithClient(() => useMutacoesCarteiraAnalise());
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
    const corpo = {
      tipoAtivo: 'acao' as const,
      assetId: 'a',
      ativo: 'WEGE3',
      instituicaoId: 'i',
      dataCompra: '2026-10-13',
      quantidade: 1,
      cotacaoUnitaria: 10,
      valorInvestido: 10,
      taxaCorretagem: 0 as const,
      estrategia: 'value',
    };
    await act(() => result.current.registrarCompra.mutateAsync(corpo));
    const [url, init] = mocks.csrfFetch.mock.calls[0];
    expect(url).toBe('/api/carteira/operacao');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(corpo);
    const keys = invalidar.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(queryKeys.analiseAtivos.carteira()));
    expect(keys).toContain(JSON.stringify(queryKeys.assets.all));
    expect(keys).toContain(JSON.stringify(queryKeys.carteira.all));
  });

  it('venda: POST /api/carteira/resgate; erro 400 real vira ErroCarteira com a mensagem', async () => {
    mocks.csrfFetch.mockResolvedValue(
      mockFetchResponse({ error: 'Instituição inválida para este investimento' }, 400),
    );
    const { result } = renderHookWithClient(() => useMutacoesCarteiraAnalise());
    let erro: unknown;
    await act(async () => {
      try {
        await result.current.registrarVenda.mutateAsync({
          portfolioId: 'pf',
          dataResgate: '2026-10-13',
          metodoResgate: 'quantidade',
          quantidade: 1,
          cotacaoUnitaria: 10,
        });
      } catch (e) {
        erro = e;
      }
    });
    expect(mocks.csrfFetch.mock.calls[0][0]).toBe('/api/carteira/resgate');
    expect(erro).toBeInstanceOf(ErroCarteira);
    expect((erro as Error).message).toBe('Instituição inválida para este investimento');
  });

  it('salvarAlvo: PUT /api/analise-ativos/alvos/[ticker] com CSRF; chip na hora; invalida a Carteira', async () => {
    const alvo = {
      origem: 'planejado',
      id: 'wl-wege',
      objetivoPct: 6,
      categoria: 'acoes',
      abaNome: 'Ações',
      secao: 'value',
    };
    mocks.csrfFetch.mockResolvedValue(mockFetchResponse({ ticker: 'WEGE3', alvo, criado: true }));
    const { result, queryClient } = renderHookWithClient(() => useMutacoesCarteiraAnalise());
    // o wrapper usa gcTime 0: segura a key do overlay sem observador
    queryClient.setQueryDefaults(queryKeys.analiseAtivos.carteira(), { gcTime: Infinity });
    queryClient.setQueryData(queryKeys.analiseAtivos.carteira(), { posicoes: {}, planejados: {} });
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
    await act(() =>
      result.current.salvarAlvo.mutateAsync({ ticker: 'wege3', objetivoPct: 6, secao: 'value' }),
    );
    const [url, init] = mocks.csrfFetch.mock.calls[0];
    expect(url).toBe('/api/analise-ativos/alvos/WEGE3');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ objetivoPct: 6, secao: 'value' });
    expect(
      (queryClient.getQueryData(queryKeys.analiseAtivos.carteira()) as { planejados: object })
        .planejados,
    ).toEqual({
      WEGE3: {
        watchlistId: 'wl-wege',
        id: 'wl-wege',
        categoria: 'acoes',
        objetivoPct: 6,
        secao: 'value',
      },
    });
    // invalidatePortfolioDerivedQueries: a Carteira (abas, resumo) mostra o objetivo/planejado
    const keys = invalidar.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(queryKeys.analiseAtivos.carteira()));
    expect(keys).toContain(JSON.stringify(queryKeys.carteira.all));
    expect(keys).toContain(JSON.stringify(queryKeys.assets.all));
  });

  it('removerAlvo: DELETE e o objetivo sai do overlay', async () => {
    mocks.csrfFetch.mockResolvedValue(
      mockFetchResponse({ ticker: 'WEGE3', removido: true, origem: 'posicao' }),
    );
    const { result, queryClient } = renderHookWithClient(() => useMutacoesCarteiraAnalise());
    // o wrapper usa gcTime 0: segura a key do overlay sem observador
    queryClient.setQueryDefaults(queryKeys.analiseAtivos.carteira(), { gcTime: Infinity });
    queryClient.setQueryData(queryKeys.analiseAtivos.carteira(), {
      posicoes: { WEGE3: { portfolioId: 'p', quantidade: 1, categoria: 'acoes', objetivoPct: 6 } },
      planejados: {},
    });
    await act(() => result.current.removerAlvo.mutateAsync('WEGE3'));
    expect(mocks.csrfFetch.mock.calls[0][0]).toBe('/api/analise-ativos/alvos/WEGE3');
    expect(mocks.csrfFetch.mock.calls[0][1].method).toBe('DELETE');
    const o = queryClient.getQueryData(queryKeys.analiseAtivos.carteira()) as {
      posicoes: Record<string, { objetivoPct: number | null }>;
    };
    expect(o.posicoes.WEGE3.objetivoPct).toBeNull();
  });

  it('salvarAlvo com erro da rota vira ErroCarteira com a mensagem', async () => {
    mocks.csrfFetch.mockResolvedValue(
      mockFetchResponse({ error: 'O objetivo pode ser no máximo 100%' }, 400),
    );
    const { result } = renderHookWithClient(() => useMutacoesCarteiraAnalise());
    let erro: unknown;
    await act(async () => {
      try {
        await result.current.salvarAlvo.mutateAsync({ ticker: 'WEGE3', objetivoPct: 120 });
      } catch (e) {
        erro = e;
      }
    });
    expect(erro).toBeInstanceOf(ErroCarteira);
    expect((erro as Error).message).toBe('O objetivo pode ser no máximo 100%');
  });
});
