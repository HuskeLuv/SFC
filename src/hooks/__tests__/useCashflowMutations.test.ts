// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import { queryKeys } from '@/lib/queryKeys';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';

const { refetchMock, dataRef } = vi.hoisted(() => ({
  refetchMock: vi.fn(async () => undefined),
  dataRef: { current: [] as unknown[] },
}));

vi.mock('@/hooks/useCashflow', () => ({
  useCashflowData: () => ({ data: dataRef.current, refetch: refetchMock }),
}));

import { useCashflowMutations, CashflowRequestError } from '../useCashflowMutations';

const YEAR = 2026;

const item = (id: string, groupId: string): CashflowItem => ({
  id,
  userId: 'u1',
  groupId,
  name: id.toUpperCase(),
  significado: null,
  rank: null,
  values: [],
});

const group = (id: string, items: CashflowItem[]): CashflowGroup => ({
  id,
  userId: 'u1',
  name: id,
  type: 'despesa',
  parentId: null,
  orderIndex: 1,
  items,
  children: [],
});

const tree = (): CashflowGroup[] => [
  group('g1', [item('a', 'g1'), item('b', 'g1'), item('c', 'g1')]),
  group('g2', [item('x', 'g2')]),
];

let fetchMock: ReturnType<typeof vi.fn>;

function setup() {
  const hook = renderHookWithClient(() => useCashflowMutations(YEAR));
  const invalidate = vi.spyOn(hook.queryClient, 'invalidateQueries');
  const setData = vi.spyOn(hook.queryClient, 'setQueryData');
  return { ...hook, invalidate, setData };
}

const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);
const headerOf = (call: unknown[], name: string) =>
  new Headers((call[1] as RequestInit).headers).get(name);

beforeEach(() => {
  refetchMock.mockClear();
  dataRef.current = tree();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  document.cookie = 'csrf-token=tok123';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saveItemChanges', () => {
  it('faz o PUT do batch-update com csrf, grava a árvore no cache e invalida', async () => {
    const groups = tree();
    fetchMock.mockResolvedValue(
      mockFetchResponse({ success: true, results: [{ itemId: 'a', success: true }], groups }),
    );
    const { result, invalidate, setData } = setup();

    let res!: Awaited<ReturnType<typeof result.current.saveItemChanges>>;
    await act(async () => {
      res = await result.current.saveItemChanges({
        groupId: 'g1',
        updates: [{ itemId: 'a', values: [{ month: 6, value: 10 }] }],
      });
    });

    const call = lastCall();
    expect(call[0]).toBe('/api/cashflow/batch-update');
    expect((call[1] as RequestInit).method).toBe('PUT');
    expect(headerOf(call, 'x-csrf-token')).toBe('tok123');
    expect(bodyOf(call)).toEqual({
      groupId: 'g1',
      year: YEAR,
      updates: [{ itemId: 'a', values: [{ month: 6, value: 10 }] }],
      deletes: [],
    });
    expect(setData).toHaveBeenCalledWith(queryKeys.cashflow.year(YEAR), groups);
    expect(refetchMock).not.toHaveBeenCalled();
    const keys = invalidate.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toEqual([
      queryKeys.cashflow.investimentos(YEAR),
      queryKeys.cashflow.orcamento(YEAR),
      queryKeys.planejamento.all,
      ['planejamento-sonhos'],
    ]);
    expect(res).toEqual({
      ok: true,
      httpOk: true,
      treeUpdated: true,
      results: [{ itemId: 'a', success: true }],
    });
  });

  it('sem árvore na resposta faz refetch (e não invalida investimentos)', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({ success: true, results: [] }));
    const { result, invalidate } = setup();

    let res!: Awaited<ReturnType<typeof result.current.saveItemChanges>>;
    await act(async () => {
      res = await result.current.saveItemChanges({ groupId: 'g1', deletes: ['a'] });
    });

    expect(bodyOf(lastCall())).toEqual({ groupId: 'g1', year: YEAR, updates: [], deletes: ['a'] });
    expect(refetchMock).toHaveBeenCalledTimes(1);
    const keys = invalidate.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).not.toContainEqual(queryKeys.cashflow.investimentos(YEAR));
    expect(keys).toContainEqual(queryKeys.cashflow.orcamento(YEAR));
    expect(res.ok).toBe(true);
    expect(res.treeUpdated).toBe(false);
  });

  it('linha recusada (success:false) → ok:false com o erro, mas httpOk:true', async () => {
    const results = [
      { itemId: 'a', success: true },
      { itemId: 'd1', success: false, error: 'Linha gerida em Dívidas' },
    ];
    fetchMock.mockResolvedValue(mockFetchResponse({ success: true, results, groups: tree() }));
    const { result } = setup();

    let res!: Awaited<ReturnType<typeof result.current.saveItemChanges>>;
    await act(async () => {
      res = await result.current.saveItemChanges({ groupId: 'g1', deletes: ['d1'] });
    });

    expect(res).toEqual({
      ok: false,
      httpOk: true,
      treeUpdated: true,
      error: 'Linha gerida em Dívidas',
      results,
    });
  });

  it('linha recusada sem mensagem usa o texto padrão', async () => {
    fetchMock.mockResolvedValue(
      mockFetchResponse({ success: true, results: [{ itemId: 'a', success: false }] }),
    );
    const { result } = setup();
    let res!: Awaited<ReturnType<typeof result.current.saveItemChanges>>;
    await act(async () => {
      res = await result.current.saveItemChanges({ groupId: 'g1' });
    });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toBe('Não foi possível salvar esta linha.');
  });

  it('HTTP de erro → httpOk:false, sem cache nem invalidação', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({ error: 'x' }, 500));
    const { result, invalidate, setData } = setup();
    let res!: Awaited<ReturnType<typeof result.current.saveItemChanges>>;
    await act(async () => {
      res = await result.current.saveItemChanges({ groupId: 'g1' });
    });
    expect(res).toEqual({
      ok: false,
      httpOk: false,
      treeUpdated: false,
      error: 'Erro ao salvar alterações',
    });
    expect(setData).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(refetchMock).not.toHaveBeenCalled();
  });

  it('falha de rede → httpOk:false', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { result } = setup();
    let res!: Awaited<ReturnType<typeof result.current.saveItemChanges>>;
    await act(async () => {
      res = await result.current.saveItemChanges({ groupId: 'g1' });
    });
    expect(res.httpOk).toBe(false);
    expect(res.ok).toBe(false);
  });
});

describe('createItem', () => {
  it('faz o POST em /api/cashflow/items e só faz refetch quando pedido', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({ id: 'novo', groupId: 'g1', name: 'Nova' }));
    const { result } = setup();

    let created!: CashflowItem;
    await act(async () => {
      created = await result.current.createItem('g1', 'Nova', 'porquê');
    });
    const call = lastCall();
    expect(call[0]).toBe('/api/cashflow/items');
    expect((call[1] as RequestInit).method).toBe('POST');
    expect(bodyOf(call)).toEqual({
      groupId: 'g1',
      name: 'Nova',
      descricao: 'Nova',
      significado: 'porquê',
    });
    expect(created.id).toBe('novo');
    expect(refetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.createItem('g1', 'Outra', undefined, { refetch: true });
    });
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('reorderItem', () => {
  it('reordena o cache na hora e manda a lista completa', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({ success: true }));
    const { result, setData } = setup();

    let ok!: boolean;
    await act(async () => {
      ok = await result.current.reorderItem('g1', 'c', 'a');
    });

    expect(ok).toBe(true);
    expect(setData).toHaveBeenCalledWith(queryKeys.cashflow.year(YEAR), expect.any(Function));
    const call = lastCall();
    expect(call[0]).toBe('/api/cashflow/item/reorder');
    expect(headerOf(call, 'x-csrf-token')).toBe('tok123');
    expect(bodyOf(call)).toEqual({ groupId: 'g1', itemIds: ['c', 'a', 'b'] });
    expect(refetchMock).not.toHaveBeenCalled();
  });

  it('falha → refetch e false', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({}, 500));
    const { result } = setup();
    let ok!: boolean;
    await act(async () => {
      ok = await result.current.reorderItem('g1', 'c', 'a');
    });
    expect(ok).toBe(false);
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('grupo inexistente ou mesma posição: nada a fazer (true, sem rede)', async () => {
    const { result } = setup();
    let ok!: boolean;
    await act(async () => {
      ok = await result.current.reorderItem('nao-existe', 'a', 'b');
    });
    expect(ok).toBe(true);
    await act(async () => {
      ok = await result.current.reorderItem('g1', 'a', 'a');
    });
    expect(ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('moveItem', () => {
  it('move no cache, POST no /item/move, invalida o orçamento e faz refetch', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({ success: true }));
    const { result, invalidate } = setup();

    let res!: Awaited<ReturnType<typeof result.current.moveItem>>;
    await act(async () => {
      res = await result.current.moveItem('a', 'g2', 'x', true);
    });

    expect(res).toEqual({ ok: true });
    const call = lastCall();
    expect(call[0]).toBe('/api/cashflow/item/move');
    expect(bodyOf(call)).toEqual({ itemId: 'a', toGroupId: 'g2', itemIds: ['x', 'a'] });
    expect(invalidate.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
      queryKeys.cashflow.orcamento(YEAR),
    ]);
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('erro do servidor vira a mensagem; HTTP sem corpo vira o texto padrão', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ error: 'Destino inválido' }, 400));
    const { result } = setup();
    let res!: Awaited<ReturnType<typeof result.current.moveItem>>;
    await act(async () => {
      res = await result.current.moveItem('a', 'g2', null, false);
    });
    expect(res).toEqual({ ok: false, error: 'Destino inválido' });
    expect(refetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(mockFetchResponse(null, 500));
    await act(async () => {
      res = await result.current.moveItem('a', 'g2', null, false);
    });
    expect(res).toEqual({ ok: false, error: 'Não foi possível mover a linha.' });
    expect(refetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('comentários da célula', () => {
  it('fetchCellComment lê com timeout e converte a data', async () => {
    fetchMock.mockResolvedValue(
      mockFetchResponse({ comment: 'oi', updatedAt: '2026-07-01T10:00:00.000Z' }),
    );
    const { result } = setup();
    let res!: Awaited<ReturnType<typeof result.current.fetchCellComment>>;
    await act(async () => {
      res = await result.current.fetchCellComment('a', 6);
    });
    const call = lastCall();
    expect(call[0]).toBe(`/api/cashflow/comments?itemId=a&month=6&year=${YEAR}`);
    expect((call[1] as RequestInit).signal).toBeDefined();
    expect(res.comment).toBe('oi');
    expect(res.updatedAt).toEqual(new Date('2026-07-01T10:00:00.000Z'));
  });

  it('fetchCellComment: 401 → "Sessão inválida"; outro erro → mensagem do servidor', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ error: 'x' }, 401));
    const { result } = setup();
    await expect(result.current.fetchCellComment('a', 6)).rejects.toThrow('Sessão inválida');
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ error: 'Item sumiu' }, 404));
    await expect(result.current.fetchCellComment('a', 6)).rejects.toThrow('Item sumiu');
  });

  it('saveCellComment faz o PATCH com csrf e refetch', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({ success: true }));
    const { result } = setup();
    await act(async () => {
      await result.current.saveCellComment('a', 6, 'nota');
    });
    const call = lastCall();
    expect(call[0]).toBe('/api/cashflow/comments');
    expect((call[1] as RequestInit).method).toBe('PATCH');
    expect(headerOf(call, 'x-csrf-token')).toBe('tok123');
    expect(bodyOf(call)).toEqual({ itemId: 'a', month: 6, year: YEAR, comment: 'nota' });
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('saveCellComment: 401 → CashflowRequestError(401); sem refetch', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({ error: 'Token expirado' }, 401));
    const { result } = setup();
    const err = await result.current.saveCellComment('a', 6, null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CashflowRequestError);
    expect((err as CashflowRequestError).status).toBe(401);
    expect((err as CashflowRequestError).message).toBe('Token expirado');
    expect(refetchMock).not.toHaveBeenCalled();
  });
});
