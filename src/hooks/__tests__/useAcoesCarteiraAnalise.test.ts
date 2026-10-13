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
  requisicaoPlano,
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

describe('requisicaoPlano — Objetivo que já existe (% da aba)', () => {
  it('posição: POST /api/carteira/<aba>/objetivo; remover = objetivo 0', () => {
    const alvo = { tipo: 'posicao' as const, portfolioId: 'pf-1', categoria: 'fiis' };
    expect(requisicaoPlano({ ticker: 'HGLG11', objetivoPct: 12.5, alvo })).toEqual({
      url: '/api/carteira/fii/objetivo',
      method: 'POST',
      body: { ativoId: 'pf-1', objetivo: 12.5 },
    });
    expect(requisicaoPlano({ ticker: 'HGLG11', objetivoPct: null, alvo })?.body).toEqual({
      ativoId: 'pf-1',
      objetivo: 0,
    });
  });

  it('planejado: PATCH; remover = DELETE', () => {
    const alvo = { tipo: 'planejado' as const, watchlistId: 'wl-1' };
    expect(requisicaoPlano({ ticker: 'X', objetivoPct: 5, alvo })).toEqual({
      url: '/api/carteira/planejados/wl-1',
      method: 'PATCH',
      body: { objetivo: 5 },
    });
    expect(requisicaoPlano({ ticker: 'X', objetivoPct: 0, alvo })).toEqual({
      url: '/api/carteira/planejados/wl-1',
      method: 'DELETE',
    });
  });

  it('novo: POST /api/carteira/planejados com tipoAtivo, seção e objetivo', () => {
    expect(
      requisicaoPlano({
        ticker: 'KNCR11',
        objetivoPct: 10,
        alvo: { tipo: 'novo', assetId: 'a-k', classe: 'fii', secao: 'tvm' },
      }),
    ).toEqual({
      url: '/api/carteira/planejados',
      method: 'POST',
      body: { assetId: 'a-k', tipoAtivo: 'fii', secao: 'tvm', objetivo: 10 },
    });
    expect(
      requisicaoPlano({
        ticker: 'WEGE3',
        objetivoPct: 6,
        alvo: { tipo: 'novo', assetId: 'a-w', classe: 'acao', secao: null },
      })?.body,
    ).toEqual({ assetId: 'a-w', tipoAtivo: 'acao', objetivo: 6 });
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

  it('salvarPlano sem nada a gravar (novo com 0%) não chama a rota', async () => {
    const { result } = renderHookWithClient(() => useMutacoesCarteiraAnalise());
    await act(() =>
      result.current.salvarPlano.mutateAsync({
        ticker: 'WEGE3',
        objetivoPct: 0,
        alvo: { tipo: 'novo', assetId: 'a', classe: 'acao', secao: null },
      }),
    );
    expect(mocks.csrfFetch).not.toHaveBeenCalled();
  });
});
