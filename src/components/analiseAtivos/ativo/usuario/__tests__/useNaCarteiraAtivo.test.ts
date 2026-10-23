// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import type { OverlayCarteiraResposta } from '@/types/analiseAtivosApi';
import { useNaCarteiraAtivo } from '../useNaCarteiraAtivo';

/**
 * Carteira EUA em US$ (FB): a linha da aba Stocks/REIT's com moedaRegistro 'USD' é coerente em
 * US$ — valor + % da carteira (valor em R$ ÷ total do resumo), sem os contornos abaMista /
 * valoresMistos. Sem moedaRegistro (rota antiga), o contorno de antes continua.
 */

const LINHA_BASE = {
  id: 'pf-aapl',
  ticker: 'AAPL',
  quantidade: 2,
  precoAquisicao: 500,
  cotacaoAtual: 512.4,
  valorAtualizado: 1024.8,
  percentualCarteira: 100,
  objetivo: 0,
  quantoFalta: 0,
  necessidadeAporte: 0,
  rentabilidade: 2.48,
};

let abaStocks: Record<string, unknown>;
let abaReit: Record<string, unknown>;
let overlay: OverlayCarteiraResposta;

const RESUMO = {
  totais: { dinheiro: 100_000, dinheiroMaisBens: 100_000 },
  distribuicao: {
    stocks: { valor: 5124, percentual: 5.12 },
    reits: { valor: 2376, percentual: 2.38 },
  },
};

function roteador(url: string) {
  if (url.startsWith('/api/analise-ativos/carteira')) return mockFetchResponse(overlay);
  if (url.startsWith('/api/carteira/stocks')) return mockFetchResponse(abaStocks);
  if (url.startsWith('/api/carteira/reit')) return mockFetchResponse(abaReit);
  if (url.startsWith('/api/carteira/resumo')) return mockFetchResponse(RESUMO);
  if (url.startsWith('/api/carteira/configuracao')) {
    return mockFetchResponse({ configuracoes: [] });
  }
  return mockFetchResponse({ error: 'não mockado' }, 500);
}

beforeEach(() => {
  overlay = {
    posicoes: {
      AAPL: {
        portfolioId: 'pf-aapl',
        quantidade: 2,
        categoria: 'stocks',
        assetId: 'a-aapl',
        tipoAsset: 'stock',
      },
    },
    planejados: {},
  };
  abaStocks = {
    cotacaoDolar: 5,
    layoutUsd: true,
    secoes: [
      {
        nome: 'Value',
        ativos: [
          { ...LINHA_BASE, moedaRegistro: 'USD', valorAtualizadoBRL: 5124, valorTotalBRL: 5100 },
        ],
      },
    ],
  };
  abaReit = {
    cotacaoDolar: 5.4,
    secoes: [
      {
        nome: 'Value',
        ativos: [
          {
            ...LINHA_BASE,
            id: 'pf-o',
            ticker: 'O-1712345678901-abc',
            quantidade: 4,
            precoAquisicao: 110,
            cotacaoAtual: 110,
            valorAtualizado: 440,
            moedaRegistro: 'USD',
            valorAtualizadoBRL: 2376,
          },
        ],
      },
    ],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => roteador(url)),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useNaCarteiraAtivo — linha em US$ (moedaRegistro)', () => {
  it("stock com moedaRegistro 'USD': valor em US$ + % da carteira pelo valor em R$", async () => {
    const { result } = renderHookWithClient(() => useNaCarteiraAtivo('AAPL', 'stock'));
    await waitFor(() => expect(result.current.carregandoNumeros).toBe(false));
    await waitFor(() => expect(result.current.linha).not.toBeNull());
    const d = result.current;
    expect(d).toMatchObject({
      status: 'posicao',
      moeda: 'USD',
      linhaEmDolar: true,
      abaMista: false,
      valoresMistos: false,
      semPesoCarteira: false,
      valorAtualizadoBRL: 5124,
      cotacaoDolar: 5,
      classePct: 5.12,
    });
    expect(d.linha?.valorAtualizado).toBeCloseTo(1024.8);
    expect(d.pctCarteira).toBeCloseTo((5124 / 100_000) * 100, 10);
  });

  it("REIT com moedaRegistro 'USD': % da carteira volta (antes ficava sem peso)", async () => {
    overlay.posicoes = {
      O: {
        portfolioId: 'pf-o',
        quantidade: 4,
        categoria: 'reits',
        assetId: 'a-o',
        tipoAsset: 'reit',
      },
    };
    const { result } = renderHookWithClient(() => useNaCarteiraAtivo('O', 'reit'));
    await waitFor(() => expect(result.current.linha).not.toBeNull());
    await waitFor(() => expect(result.current.carregandoNumeros).toBe(false));
    expect(result.current).toMatchObject({ moeda: 'USD', linhaEmDolar: true });
    expect(result.current.pctCarteira).toBeCloseTo(2.376, 10);
  });

  it('linha em US$ sem valorAtualizadoBRL: converte pela cotação da aba', async () => {
    abaStocks = {
      cotacaoDolar: 5,
      secoes: [{ nome: 'Value', ativos: [{ ...LINHA_BASE, moedaRegistro: 'USD' }] }],
    };
    const { result } = renderHookWithClient(() => useNaCarteiraAtivo('AAPL', 'stock'));
    await waitFor(() => expect(result.current.linha).not.toBeNull());
    await waitFor(() => expect(result.current.carregandoNumeros).toBe(false));
    expect(result.current.valorAtualizadoBRL).toBeCloseTo(5124);
    expect(result.current.pctCarteira).toBeCloseTo(5.124, 10);
  });

  it('sem moedaRegistro (rota antiga): mantém o contorno (valores mistos, sem peso)', async () => {
    abaStocks = {
      cotacaoDolar: 5,
      secoes: [{ nome: 'Value', ativos: [LINHA_BASE] }],
    };
    const { result } = renderHookWithClient(() => useNaCarteiraAtivo('AAPL', 'stock'));
    await waitFor(() => expect(result.current.linha).not.toBeNull());
    await waitFor(() => expect(result.current.carregandoNumeros).toBe(false));
    expect(result.current).toMatchObject({
      moeda: 'BRL',
      linhaEmDolar: false,
      abaMista: true,
      valoresMistos: true,
      semPesoCarteira: true,
      pctCarteira: null,
      valorAtualizadoBRL: null,
    });
  });
});
