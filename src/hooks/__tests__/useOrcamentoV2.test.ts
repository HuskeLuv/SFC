// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import { queryKeys } from '@/lib/queryKeys';
import type { OrcamentoV2Response, SubcategoriaV2 } from '@/types/orcamentoV2';
import { useOrcamentoV2, ErroOrcamentoV2 } from '../useOrcamentoV2';
import { useOrcamentoV2Acesso } from '../useOrcamentoV2Acesso';

// ─── Payload sintético (out/2026, receita 10.000, ritmo 0,5) ────────────────────────────────

const sub = (id: string, extra: Partial<SubcategoriaV2> = {}): SubcategoriaV2 => ({
  id,
  nome: id,
  geral: false,
  fixa: false,
  espelho: null,
  orcado: 0,
  valor: null,
  pct: null,
  realizado: 0,
  diferenca: 0,
  consumido: null,
  status: 'none',
  editavelEstrutura: true,
  editavelOrcado: true,
  ...extra,
});

function payload(): OrcamentoV2Response {
  return {
    versao: 2,
    ano: 2026,
    mes: 10,
    visao: 'mes',
    fonte: 'lancado',
    referencia: {
      dia: 15,
      diasNoMes: 31,
      ritmo: 0.5,
      fase: 'corrente',
      rotuloRealizado: 'lancado',
      atualizadoEm: '2026-10-15T12:00:00.000Z',
    },
    receitaPrevista: { valor: 10000, origem: 'fluxo' },
    resumo: {
      orcado: 1000,
      orcadoPctReceita: 10,
      realizado: 300,
      realizadoPctOrcado: 30,
      disponivel: 700,
      sobraPrevista: 9000,
      indicePoupanca: 90,
      totalCategorias: 1,
      totalSubcategorias: 2,
      contagens: { estouro: 0, aFrente: 0, semOrcamento: 0 },
      status: 'ok',
    },
    copiarDe: { ano: 2026, mes: 9, temOrcado: true },
    prefs: { categoriasRecolhidas: [], graficoVisivel: true, avisoGeralPendente: true },
    categorias: [
      {
        id: 'hab',
        nome: 'Habitação',
        icone: 'casa',
        abreviacao: 'Hab',
        poupanca: false,
        sistema: true,
        orcado: 1000,
        realizado: 300,
        diferenca: 700,
        consumido: 0.3,
        pctReceita: 10,
        status: 'ok',
        qtdEstouro: 0,
        qtdAFrente: 0,
        qtdComOrcamento: 1,
        subcategorias: [
          sub('alug', {
            orcado: 1000,
            valor: 1000,
            realizado: 300,
            diferenca: 700,
            consumido: 0.3,
            status: 'ok',
          }),
          sub('geral', { geral: true, editavelEstrutura: false }),
        ],
      },
    ],
  };
}

const PARAMS = { ano: 2026, mes: 10 } as const;
const CHAVE = queryKeys.cashflow.orcamentoV2(2026, 10, 'mes', 'padrao');

let fetchMock: ReturnType<typeof vi.fn>;
const chamadas = (metodo: string) =>
  fetchMock.mock.calls.filter((c) => ((c[1] as RequestInit)?.method ?? 'GET') === metodo);
const corpo = (c: unknown[]) => JSON.parse((c[1] as RequestInit).body as string);
const header = (c: unknown[], nome: string) => new Headers((c[1] as RequestInit).headers).get(nome);

/** Promessa controlável: deixa o teste olhar o cache durante o PUT. */
function adiado<T>() {
  let resolver!: (v: T) => void;
  const promessa = new Promise<T>((r) => (resolver = r));
  return { promessa, resolver };
}

async function montar() {
  fetchMock.mockResolvedValueOnce(mockFetchResponse(payload()));
  const hook = renderHookWithClient(() => useOrcamentoV2(PARAMS));
  // gcTime 0 do cliente de teste: as chaves "das outras visões" (sem observador) sumiriam na hora.
  hook.queryClient.setQueryDefaults(queryKeys.cashflow.orcamentoV2Todos(), { gcTime: Infinity });
  await waitFor(() => expect(hook.result.current.data).not.toBeNull());
  return hook;
}

const subDoCache = (qc: ReturnType<typeof renderHookWithClient>['queryClient'], id: string) =>
  qc
    .getQueryData<OrcamentoV2Response>(CHAVE)!
    .categorias.flatMap((c) => c.subcategorias)
    .find((s) => s.id === id);

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  document.cookie = 'csrf-token=tok123';
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useOrcamentoV2 — query', () => {
  it('busca o GET v2 com credentials e a chave do mês (fonte "padrao" sem fonte)', async () => {
    const { result } = await montar();
    expect(result.current.data?.categorias).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/cashflow/orcamento/v2?ano=2026&mes=10&visao=mes');
    expect((init as RequestInit).credentials).toBe('include');
  });

  it('com fonte explícita: vai na URL e na chave', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(payload()));
    const { result, queryClient } = renderHookWithClient(() =>
      useOrcamentoV2({ ...PARAMS, visao: 'ano', fonte: 'consolidado' }),
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(fetchMock.mock.calls[0][0]).toContain('visao=ano&fonte=consolidado');
    expect(
      queryClient.getQueryData(queryKeys.cashflow.orcamentoV2(2026, 10, 'ano', 'consolidado')),
    ).toBeDefined();
  });
});

describe('useOrcamentoV2 — salvarOrcado (otimista)', () => {
  it('recalcula a linha/categoria/resumo na hora, faz o PUT com csrf e troca pela resposta', async () => {
    const { result, queryClient } = await montar();
    const outra = queryKeys.cashflow.orcamentoV2(2026, 10, 'ano', 'padrao');
    queryClient.setQueryData(outra, payload());
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const put = adiado<Response>();
    fetchMock.mockReturnValueOnce(put.promessa);
    act(() => {
      result.current.salvarOrcado.mutate({ itemId: 'alug', valor: 400 });
    });

    // Palpite pelas regras puras: 300 de 400 = 75% consumido (< 80%) → 'ok'; disponível 100.
    await waitFor(() => expect(subDoCache(queryClient, 'alug')?.orcado).toBe(400));
    expect(subDoCache(queryClient, 'alug')).toMatchObject({ valor: 400, status: 'ok' });
    const cache = queryClient.getQueryData<OrcamentoV2Response>(CHAVE)!;
    expect(cache.categorias[0].orcado).toBe(400);
    expect(cache.resumo.orcado).toBe(400);
    expect(cache.resumo.disponivel).toBe(100);

    const [url, init] = chamadas('PUT')[0];
    expect(url).toBe('/api/cashflow/orcamento/v2/subcategorias/alug/orcado');
    expect(corpo([url, init])).toEqual({ ano: 2026, mes: 10, valor: 400 });
    expect(header([url, init], 'x-csrf-token')).toBe('tok123');

    // Resposta do servidor (id personalizado, categoria e resumo recalculados).
    const servidor = payload();
    const cat = {
      ...servidor.categorias[0],
      orcado: 400,
      subcategorias: [{ ...servidor.categorias[0].subcategorias[0], id: 'alug-u', orcado: 400 }],
    };
    put.resolver(
      mockFetchResponse({
        subcategoria: cat.subcategorias[0],
        categoria: cat,
        resumo: { ...servidor.resumo, orcado: 400, disponivel: 100 },
      }),
    );
    await waitFor(() => expect(result.current.salvarOrcado.isSuccess).toBe(true));
    expect(subDoCache(queryClient, 'alug-u')?.orcado).toBe(400);
    expect(subDoCache(queryClient, 'alug')).toBeUndefined();
    // As outras visões do v2 são invalidadas; a aberta não (já tem a resposta).
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.cashflow.orcamentoV2Todos() }),
    );
    expect(queryClient.getQueryState(outra)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(CHAVE)?.isInvalidated).toBe(false);
  });

  it('erro do servidor → rollback ao payload anterior e erro com codigo', async () => {
    const { result, queryClient } = await montar();
    const antes = queryClient.getQueryData<OrcamentoV2Response>(CHAVE);
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse({ error: 'Percentual…', codigo: 'pct_nao_permitido' }, 400),
    );
    await act(async () => {
      await result.current.salvarOrcado.mutateAsync({ itemId: 'alug', pct: 5 }).catch(() => {});
    });
    expect(queryClient.getQueryData(CHAVE)).toEqual(antes);
    expect(result.current.salvarOrcado.error).toBeInstanceOf(ErroOrcamentoV2);
    expect(result.current.salvarOrcado.error).toMatchObject({
      status: 400,
      codigo: 'pct_nao_permitido',
    });
    expect(corpo(chamadas('PUT')[0])).toEqual({ ano: 2026, mes: 10, pct: 5 });
  });

  it('limpar (valor null) zera o orçado no palpite', async () => {
    const { result, queryClient } = await montar();
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    act(() => {
      result.current.salvarOrcado.mutate({ itemId: 'alug', valor: null });
    });
    await waitFor(() => expect(subDoCache(queryClient, 'alug')?.orcado).toBe(0));
    expect(subDoCache(queryClient, 'alug')).toMatchObject({ valor: null, status: 'bad' });
  });
});

describe('useOrcamentoV2 — troca de mês com a escrita pendente', () => {
  const NOV = queryKeys.cashflow.orcamentoV2(2026, 11, 'mes', 'padrao');
  // Nov tem a mesma categoria (mesmo id), ainda sem orçado.
  const payloadNov = (): OrcamentoV2Response => {
    const p = payload();
    const cat = {
      ...p.categorias[0],
      orcado: 0,
      subcategorias: [sub('alug'), p.categorias[0].subcategorias[1]],
    };
    return { ...p, mes: 11, categorias: [cat], resumo: { ...p.resumo, orcado: 0 } };
  };
  const orcadoNov = (qc: ReturnType<typeof renderHookWithClient>['queryClient']) => {
    const d = qc.getQueryData<OrcamentoV2Response>(NOV)!;
    return [
      d.mes,
      d.resumo.orcado,
      d.categorias[0].orcado,
      d.categorias[0].subcategorias[0].orcado,
    ];
  };

  async function montarTrocavel() {
    let params: { ano: number; mes: number } = { ...PARAMS };
    fetchMock.mockResolvedValueOnce(mockFetchResponse(payload()));
    const hook = renderHookWithClient(() => useOrcamentoV2(params));
    hook.queryClient.setQueryDefaults(queryKeys.cashflow.orcamentoV2Todos(), { gcTime: Infinity });
    await waitFor(() => expect(hook.result.current.data).not.toBeNull());
    const irParaNov = async () => {
      params = { ano: 2026, mes: 11 };
      hook.rerender();
      await waitFor(() => expect(hook.result.current.data?.mes).toBe(11));
    };
    return { ...hook, irParaNov };
  }

  const respostaOut = () => {
    const p = payload();
    const cat = {
      ...p.categorias[0],
      orcado: 400,
      subcategorias: [{ ...p.categorias[0].subcategorias[0], orcado: 400, valor: 400 }],
    };
    return {
      subcategoria: cat.subcategorias[0],
      categoria: cat,
      resumo: { ...p.resumo, orcado: 400 },
    };
  };

  it('sucesso: a resposta vai para o mês da edição (out), não para o aberto (nov)', async () => {
    const { result, queryClient, irParaNov } = await montarTrocavel();
    const put = adiado<Response>();
    fetchMock.mockReturnValueOnce(put.promessa);
    act(() => {
      result.current.salvarOrcado.mutate({ itemId: 'alug', valor: 400 });
    });
    await waitFor(() => expect(chamadas('PUT')).toHaveLength(1));
    fetchMock.mockResolvedValue(mockFetchResponse(payloadNov()));
    await irParaNov();

    put.resolver(mockFetchResponse(respostaOut()));
    await waitFor(() => expect(subDoCache(queryClient, 'alug')?.valor).toBe(400));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(orcadoNov(queryClient)).toEqual([11, 0, 0, 0]);
    expect(corpo(chamadas('PUT')[0])).toMatchObject({ ano: 2026, mes: 10 });
  });

  it('erro: o rollback volta o mês da edição (out) e não grava out em nov', async () => {
    const { result, queryClient, irParaNov } = await montarTrocavel();
    const put = adiado<Response>();
    fetchMock.mockReturnValueOnce(put.promessa);
    act(() => {
      result.current.salvarOrcado.mutate({ itemId: 'alug', valor: 400 });
    });
    await waitFor(() => expect(subDoCache(queryClient, 'alug')?.orcado).toBe(400));
    fetchMock.mockResolvedValue(mockFetchResponse(payloadNov()));
    await irParaNov();

    put.resolver(mockFetchResponse({ error: 'x' }, 500));
    await waitFor(() => expect(subDoCache(queryClient, 'alug')?.orcado).toBe(1000));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(orcadoNov(queryClient)).toEqual([11, 0, 0, 0]);
  });
});

describe('useOrcamentoV2 — marcarFixa, prefs e copiar', () => {
  it('marcarFixa: palpite com rollback no erro', async () => {
    const { result, queryClient } = await montar();
    const put = adiado<Response>();
    fetchMock.mockReturnValueOnce(put.promessa);
    act(() => {
      result.current.marcarFixa.mutate({ itemId: 'alug', fixa: true });
    });
    await waitFor(() => expect(subDoCache(queryClient, 'alug')?.fixa).toBe(true));
    expect(corpo(chamadas('PATCH')[0])).toEqual({ fixa: true, ano: 2026, mes: 10 });
    put.resolver(mockFetchResponse({ error: 'x' }, 500));
    await waitFor(() => expect(result.current.marcarFixa.isError).toBe(true));
    expect(subDoCache(queryClient, 'alug')?.fixa).toBe(false);
  });

  it('salvarPrefs: otimista em todos os payloads do v2; rollback no erro', async () => {
    const { result, queryClient } = await montar();
    const outra = queryKeys.cashflow.orcamentoV2(2026, 9, 'mes', 'padrao');
    queryClient.setQueryData(outra, payload());
    const put = adiado<Response>();
    fetchMock.mockReturnValueOnce(put.promessa);
    act(() => {
      result.current.salvarPrefs.mutate({ categoriasRecolhidas: ['hab'], avisoGeralVisto: true });
    });
    await waitFor(() =>
      expect(
        queryClient.getQueryData<OrcamentoV2Response>(outra)?.prefs.categoriasRecolhidas,
      ).toEqual(['hab']),
    );
    expect(queryClient.getQueryData<OrcamentoV2Response>(CHAVE)?.prefs).toEqual({
      categoriasRecolhidas: ['hab'],
      graficoVisivel: true,
      avisoGeralPendente: false,
    });
    expect(chamadas('PUT')[0][0]).toBe('/api/cashflow/orcamento/v2/prefs');

    put.resolver(mockFetchResponse({ error: 'x' }, 500));
    await waitFor(() => expect(result.current.salvarPrefs.isError).toBe(true));
    expect(
      queryClient.getQueryData<OrcamentoV2Response>(outra)?.prefs.categoriasRecolhidas,
    ).toEqual([]);
    expect(queryClient.getQueryData<OrcamentoV2Response>(CHAVE)?.prefs.avisoGeralPendente).toBe(
      true,
    );
  });

  it('copiarMes: POST com o mês aberto como destino e invalida todo o v2', async () => {
    const { result, queryClient } = await montar();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ copiados: 3, ignorados: 1 }));
    let r: unknown;
    await act(async () => {
      r = await result.current.copiarMes.mutateAsync({
        de: { ano: 2026, mes: 9 },
        sobrescrever: false,
      });
    });
    expect(r).toEqual({ copiados: 3, ignorados: 1 });
    expect(corpo(chamadas('POST')[0])).toEqual({
      de: { ano: 2026, mes: 9 },
      para: { ano: 2026, mes: 10 },
      sobrescrever: false,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.cashflow.orcamentoV2Todos() });
  });
});

describe('useOrcamentoV2Acesso', () => {
  it('usarV2 só com liberada && ativado', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ estado: 'liberada', ativado: true }));
    const { result } = renderHookWithClient(() => useOrcamentoV2Acesso());
    expect(result.current.usarV2).toBe(false); // carregando → tela de hoje
    await waitFor(() => expect(result.current.usarV2).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/cashflow/orcamento/v2/acesso');
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe('include');
  });

  it.each([
    [{ estado: 'desligada', ativado: false }, false, false],
    [{ estado: 'fora_do_beta', ativado: true }, false, false],
    [{ estado: 'liberada', ativado: false }, false, true],
  ])('%j → usarV2=%s, precisaAtivar=%s', async (resposta, usarV2, precisaAtivar) => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(resposta));
    const { result } = renderHookWithClient(() => useOrcamentoV2Acesso());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.usarV2).toBe(usarV2);
    expect(result.current.precisaAtivar).toBe(precisaAtivar);
  });

  it('ativar: POST com csrf e invalida acesso + v2', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ estado: 'liberada', ativado: false }));
    const { result, queryClient } = renderHookWithClient(() => useOrcamentoV2Acesso());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ status: 'aplicado' }));
    fetchMock.mockResolvedValue(mockFetchResponse({ estado: 'liberada', ativado: true }));
    await act(async () => {
      await result.current.ativar.mutateAsync();
    });
    const post = chamadas('POST')[0];
    expect(post[0]).toBe('/api/cashflow/orcamento/v2/ativar');
    expect(header(post, 'x-csrf-token')).toBe('tok123');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.cashflow.orcamentoV2Acesso() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.cashflow.orcamentoV2Todos() });
  });
});
