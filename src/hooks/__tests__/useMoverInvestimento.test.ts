// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { MoverAlvo } from '@/types/carteiraMover';

const { mostrarToastMover } = vi.hoisted(() => ({ mostrarToastMover: vi.fn() }));
vi.mock('@/components/carteira/mover/moverToast', () => ({ mostrarToastMover }));

import { useMoverInvestimento, MoverErro } from '../useMoverInvestimento';

const linha = (id: string, tipo: string, valor: number) => ({
  id,
  ticker: id.toUpperCase(),
  tipo,
  quantidade: 10,
  valorTotal: valor,
  valorAtualizado: valor,
  objetivo: 5,
});

const dadosFii = () => ({
  secoes: [
    {
      tipo: 'fofi',
      nome: 'FOF',
      ativos: [linha('pf-kdif', 'fofi', 1000), linha('pf-cpti', 'fofi', 500)],
      totalValorAtualizado: 1500,
      totalObjetivo: 10,
    },
    {
      tipo: 'tvm',
      nome: 'TVM',
      ativos: [linha('pf-irim', 'tvm', 800)],
      totalValorAtualizado: 800,
      totalObjetivo: 5,
    },
  ],
  totalGeral: { valorAtualizado: 2300, objetivo: 15 },
});

const ALVO: MoverAlvo = {
  tipo: 'posicao',
  id: 'pf-kdif',
  categoria: 'fiis',
  secaoAtual: 'fofi',
  label: 'KDIF11',
};

type Resolver = (r: Response) => void;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  queryClient.setQueryData(queryKeys.assets.type('fii'), dadosFii());
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  const hook = renderHook(() => useMoverInvestimento(), { wrapper });
  return { queryClient, hook };
}

const fiiCache = (qc: QueryClient) =>
  qc.getQueryData(queryKeys.assets.type('fii')) as ReturnType<typeof dadosFii>;

describe('useMoverInvestimento', () => {
  let resolverPost: Resolver | null;
  const fetchMock = vi.fn();

  beforeEach(() => {
    resolverPost = null;
    mostrarToastMover.mockReset();
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/carteira/mover' && init?.method === 'POST') {
        return new Promise<Response>((resolve) => {
          resolverPost = resolve;
        });
      }
      if (String(url).includes('/undo')) return Promise.resolve(jsonResponse({ success: true }));
      // refetch das caches invalidadas
      return Promise.resolve(jsonResponse(dadosFii()));
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('entre seções: move a linha no cache com totais, marca pendente e avisa com Desfazer', async () => {
    const { queryClient, hook } = setup();
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
    let promessa!: Promise<unknown>;
    act(() => {
      promessa = hook.result.current.mover({ alvo: ALVO, categoria: 'fiis', subgrupo: 'tvm' });
    });

    await waitFor(() => expect(resolverPost).not.toBeNull());
    const durante = fiiCache(queryClient);
    const tvm = durante.secoes.find((s) => s.tipo === 'tvm')!;
    expect(tvm.ativos.map((a) => a.id)).toEqual(['pf-irim', 'pf-kdif']);
    expect(tvm.totalValorAtualizado).toBe(1800);
    expect((tvm.ativos[1] as Record<string, unknown>)._pendente).toBe(true);
    expect(hook.result.current.pendingId).toBe('pf-kdif');

    const body = JSON.parse(fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')![1].body);
    expect(body).toEqual({
      acao: 'mover',
      tipo: 'posicao',
      id: 'pf-kdif',
      categoria: 'fiis',
      subgrupo: 'tvm',
    });

    await act(async () => {
      resolverPost!(
        jsonResponse({
          ok: true,
          origem: { categoria: 'fiis', subgrupo: 'fofi' },
          destino: { categoria: 'fiis', subgrupo: 'tvm' },
          objetivoZerado: false,
          historicoId: 'h1',
        }),
      );
      await promessa;
    });

    expect(mostrarToastMover).toHaveBeenCalledTimes(1);
    const toast = mostrarToastMover.mock.calls[0][0];
    expect(toast).toMatchObject({ tipo: 'ok', mensagem: 'KDIF11 movido para TVM.' });
    expect(toast.ver).toBeUndefined();
    expect(typeof toast.desfazer).toBe('function');
    expect(hook.result.current.realceId).toBe('pf-kdif');
    await waitFor(() => expect(hook.result.current.pendingId).toBeUndefined());

    const chaves = invalidar.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(chaves).toContain(JSON.stringify(queryKeys.assets.all));
    expect(chaves).toContain(JSON.stringify(queryKeys.historicoAlteracoes.all));
    expect(chaves).toContain(JSON.stringify(queryKeys.carteiraMover.all));
  });

  it('outra aba: tira a linha da origem e o aviso traz "Ver em Fundos" e o objetivo zerado', async () => {
    const { queryClient, hook } = setup();
    let promessa!: Promise<unknown>;
    act(() => {
      promessa = hook.result.current.mover({ alvo: ALVO, categoria: 'fimFia', subgrupo: 'fiagro' });
    });
    await waitFor(() => expect(resolverPost).not.toBeNull());
    const durante = fiiCache(queryClient);
    expect(durante.secoes[0].ativos.map((a) => a.id)).toEqual(['pf-cpti']);
    expect(durante.totalGeral.valorAtualizado).toBe(1300);

    await act(async () => {
      resolverPost!(
        jsonResponse({
          ok: true,
          origem: { categoria: 'fiis', subgrupo: 'fofi' },
          destino: { categoria: 'fimFia', subgrupo: 'fiagro' },
          objetivoZerado: true,
          historicoId: 'h2',
        }),
      );
      await promessa;
    });
    const toast = mostrarToastMover.mock.calls[0][0];
    expect(toast.mensagem).toBe('KDIF11 movido para Fundos › Fiagro. Objetivo voltou a 0%.');
    expect(toast.ver.label).toBe('Ver em Fundos');
  });

  it('erro: desfaz o otimista, avisa onde a linha ficou com "Tentar de novo" e rejeita', async () => {
    const { queryClient, hook } = setup();
    const antes = fiiCache(queryClient);
    let erro: unknown;
    let promessa!: Promise<unknown>;
    act(() => {
      promessa = hook.result.current
        .mover({ alvo: ALVO, categoria: 'fiis', subgrupo: 'tvm' })
        .catch((e) => {
          erro = e;
        });
    });
    await waitFor(() => expect(resolverPost).not.toBeNull());
    await act(async () => {
      resolverPost!(jsonResponse({ error: 'falhou' }, 500));
      await promessa;
    });

    expect(erro).toBeInstanceOf(MoverErro);
    expect(fiiCache(queryClient)).toEqual(antes);
    const toast = mostrarToastMover.mock.calls[0][0];
    expect(toast.tipo).toBe('erro');
    expect(toast.mensagem).toBe(
      "Não foi possível mover KDIF11. Ele continua em FII's › FOF (Fundos de Fundos).",
    );
    expect(typeof toast.tentarDeNovo).toBe('function');
  });

  it('offline: não pausa a mutação — o fetch falha e cai no erro de rede', async () => {
    onlineManager.setOnline(false);
    try {
      fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
      const { queryClient, hook } = setup();
      const antes = fiiCache(queryClient);
      let erro: unknown;
      await act(async () => {
        await hook.result.current
          .mover({ alvo: ALVO, categoria: 'fiis', subgrupo: 'tvm' })
          .catch((e) => {
            erro = e;
          });
      });
      expect(erro).toBeInstanceOf(MoverErro);
      expect((erro as MoverErro).status).toBeUndefined();
      expect(fiiCache(queryClient)).toEqual(antes);
      expect(hook.result.current.pendingId).toBeUndefined();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('recusa do servidor (409): mostra o motivo e não oferece "Tentar de novo"', async () => {
    const { hook } = setup();
    let promessa!: Promise<unknown>;
    act(() => {
      promessa = hook.result.current
        .mover({ alvo: ALVO, categoria: 'stocks', subgrupo: 'value' })
        .catch(() => {});
    });
    await waitFor(() => expect(resolverPost).not.toBeNull());
    await act(async () => {
      resolverPost!(jsonResponse({ error: 'Em reais — esta aba é em dólar' }, 409));
      await promessa;
    });
    const toast = mostrarToastMover.mock.calls[0][0];
    expect(toast.mensagem).toContain('Em reais — esta aba é em dólar');
    expect(toast.tentarDeNovo).toBeUndefined();
  });

  it('Desfazer do aviso chama o undo do histórico e avisa que voltou', async () => {
    const { hook } = setup();
    let promessa!: Promise<unknown>;
    act(() => {
      promessa = hook.result.current.mover({ alvo: ALVO, categoria: 'fiis', subgrupo: 'tvm' });
    });
    await waitFor(() => expect(resolverPost).not.toBeNull());
    await act(async () => {
      resolverPost!(
        jsonResponse({
          ok: true,
          origem: { categoria: 'fiis', subgrupo: 'fofi' },
          destino: { categoria: 'fiis', subgrupo: 'tvm' },
          objetivoZerado: false,
          historicoId: 'h9',
        }),
      );
      await promessa;
    });
    const { desfazer } = mostrarToastMover.mock.calls[0][0];
    await act(async () => {
      desfazer();
    });
    await waitFor(() => expect(mostrarToastMover).toHaveBeenCalledTimes(2));
    const undoCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/undo'));
    expect(undoCall![0]).toBe('/api/historico-alteracoes/h9/undo');
    expect(undoCall![1].method).toBe('POST');
    expect(mostrarToastMover.mock.calls[1][0]).toMatchObject({
      tipo: 'info',
      mensagem: "Movimento desfeito. KDIF11 voltou para FII's › FOF (Fundos de Fundos).",
    });
  });

  it('referência no trio (página do ativo): o aviso usa o nome, não o símbolo sintético', async () => {
    const { queryClient, hook } = setup();
    queryClient.setQueryData(queryKeys.carteiraMover.opcoes('posicao', 'pf-cdb'), {
      item: { tipo: 'posicao', id: 'pf-cdb', ticker: 'RENDA-FIXA-123-abc', nome: 'CDB Banco X' },
      atual: { categoria: 'rendaFixaFundos', subgrupo: 'pos-fixada' },
    });
    queryClient.setQueryData(queryKeys.carteiraMover.opcoes('posicao', 'pf-kdif'), {
      item: { tipo: 'posicao', id: 'pf-kdif', ticker: 'KDIF11', nome: 'Kinea Infra' },
      atual: { categoria: 'fiis', subgrupo: 'fofi' },
    });
    for (const [id, origem, destino] of [
      ['pf-cdb', 'rendaFixaFundos', 'reservaOportunidade'],
      ['pf-kdif', 'fiis', 'fimFia'],
    ] as const) {
      let promessa!: Promise<unknown>;
      resolverPost = null;
      act(() => {
        promessa = hook.result.current.mover({
          alvo: { tipo: 'posicao', id },
          categoria: destino,
          subgrupo: null,
        });
      });
      await waitFor(() => expect(resolverPost).not.toBeNull());
      await act(async () => {
        resolverPost!(
          jsonResponse({
            ok: true,
            origem: { categoria: origem, subgrupo: null },
            destino: { categoria: destino, subgrupo: null },
            objetivoZerado: false,
          }),
        );
        await promessa;
      });
    }
    expect(mostrarToastMover.mock.calls[0][0].mensagem).toBe(
      'CDB Banco X movido para Reserva Oportunidade.',
    );
    expect(mostrarToastMover.mock.calls[1][0].mensagem).toMatch(/^KDIF11 movido para Fundos/);
  });

  it('noop: nenhum aviso', async () => {
    const { hook } = setup();
    let promessa!: Promise<unknown>;
    act(() => {
      promessa = hook.result.current.restaurar({ tipo: 'posicao', id: 'pf-kdif' });
    });
    await waitFor(() => expect(resolverPost).not.toBeNull());
    await act(async () => {
      resolverPost!(jsonResponse({ ok: true, noop: true }));
      await promessa;
    });
    expect(mostrarToastMover).not.toHaveBeenCalled();
  });
});
