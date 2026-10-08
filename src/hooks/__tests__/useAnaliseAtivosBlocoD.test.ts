// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';

const mockCsrfFetch = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useCsrf', () => ({
  useCsrf: () => ({ csrfFetch: mockCsrfFetch, getCsrfToken: vi.fn() }),
}));

import {
  baixarCsvRaioX,
  nomeDoContentDisposition,
  ordenarComparadorPelosSlots,
  useApagarCenario,
  useCenarios,
  useComparador,
  useRaioX,
  useSalvarCenario,
} from '@/hooks/useAnaliseAtivosBlocoD';
import { queryKeys } from '@/lib/queryKeys';
import type { CenariosResposta, ComparadorResposta } from '@/types/analiseAtivosBlocoD';

function comparador(ordem: string[]): ComparadorResposta {
  return {
    classe: 'acao',
    tickers: ordem,
    ignorados: [],
    misto: false,
    ativos: ordem.map((t) => ({ ticker: t }) as ComparadorResposta['ativos'][number]),
    grupos: [],
    graficos: {
      tipo: 'lucro',
      titulo: '',
      anos: [],
      escala: { min: 0, max: 100 },
      series: ordem.map((t) => ({ ticker: t, pontos: [], emConferencia: [], insuficiente: true })),
    },
    resumo: {
      indices: ordem.map((t) => ({ ticker: t, valor: 8, incompleto: false })),
      criteriosAtendidos: ordem.map((t) => ({ ticker: t, atende: 4, total: 5 })),
      emConferencia: [],
      responsabilidade: 'x',
    },
    versao: 'v',
  };
}

const cenarioAcao = {
  ticker: 'WEGE3',
  classe: 'acao',
  nome: 'WEG',
  salvo: null,
  podeSalvar: true,
  motivoSemSalvar: null,
} as unknown as CenariosResposta;

describe('useAnaliseAtivosBlocoD', () => {
  beforeEach(() => {
    mockCsrfFetch.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('nomeDoContentDisposition: filename*, filename entre aspas e ausente', () => {
    expect(nomeDoContentDisposition('attachment; filename="raio-x_WEGE3_2026-10-08.csv"')).toBe(
      'raio-x_WEGE3_2026-10-08.csv',
    );
    expect(
      nomeDoContentDisposition(
        'attachment; filename="x.csv"; filename*=UTF-8\'\'raio-x_HGLG11_2026-10-08.csv',
      ),
    ).toBe('raio-x_HGLG11_2026-10-08.csv');
    expect(nomeDoContentDisposition(null)).toBeNull();
    expect(nomeDoContentDisposition('inline')).toBeNull();
  });

  it('ordenarComparadorPelosSlots: ativos, séries e resumo na ordem dos slots', () => {
    const r = ordenarComparadorPelosSlots(comparador(['ITUB4', 'TAEE11', 'WEGE3']), [
      'WEGE3',
      'ITUB4',
      'TAEE11',
    ]);
    expect(r.tickers).toEqual(['WEGE3', 'ITUB4', 'TAEE11']);
    expect(r.ativos.map((a) => a.ticker)).toEqual(['WEGE3', 'ITUB4', 'TAEE11']);
    expect(r.graficos?.series.map((s) => s.ticker)).toEqual(['WEGE3', 'ITUB4', 'TAEE11']);
    expect(r.resumo.indices.map((s) => s.ticker)).toEqual(['WEGE3', 'ITUB4', 'TAEE11']);
    expect(r.resumo.criteriosAtendidos.map((s) => s.ticker)).toEqual(['WEGE3', 'ITUB4', 'TAEE11']);
  });

  it('useRaioX busca a rota do ticker com cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ ticker: 'WEGE3' }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHookWithClient(() => useRaioX('WEGE3'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/analise-ativos/ativos/WEGE3/raio-x');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
  });

  it('useRaioX com enabled=false não busca (recurso desligado)', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderHookWithClient(() => useRaioX('WEGE3', { enabled: false }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('useComparador: chave ordenada + 1º slot, pedido na ordem dos slots, select reordena', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(comparador(['ITUB4', 'WEGE3'])));
    vi.stubGlobal('fetch', fetchMock);
    const { result, queryClient } = renderHookWithClient(() => useComparador(['WEGE3', 'ITUB4']));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/analise-ativos/comparador?t=WEGE3,ITUB4');
    expect(result.current.data?.ativos.map((a) => a.ticker)).toEqual(['WEGE3', 'ITUB4']);
    expect(
      queryClient.getQueryData(queryKeys.analiseAtivos.comparador(['ITUB4', 'WEGE3'], 'WEGE3')),
    ).toBeDefined();
  });

  it('useSalvarCenario: PUT com CSRF e grava o salvo no cache; erro vira ErroAnalise', async () => {
    mockCsrfFetch.mockResolvedValueOnce(
      mockFetchResponse({ atualizadoEm: '2026-10-08T12:00:00Z' }),
    );
    const { result, queryClient } = renderHookWithClient(() => ({
      cen: useCenarios('WEGE3', { enabled: false }),
      salvar: useSalvarCenario('WEGE3'),
    }));
    queryClient.setQueryData(queryKeys.analiseAtivos.cenario('WEGE3'), cenarioAcao);
    const premissas = { yieldPct: 6, gPct: 8, kPct: 13, margemPct: 20 };
    await result.current.salvar.mutateAsync({ classe: 'acao', premissas, dados: { lpa: 1.44 } });
    expect(mockCsrfFetch).toHaveBeenCalledWith(
      '/api/analise-ativos/cenarios/WEGE3',
      expect.objectContaining({ method: 'PUT' }),
    );
    const cache = queryClient.getQueryData<CenariosResposta>(
      queryKeys.analiseAtivos.cenario('WEGE3'),
    );
    expect(cache?.salvo).toEqual({
      premissas,
      dadosEditados: { lpa: 1.44 },
      atualizadoEm: '2026-10-08T12:00:00Z',
    });

    mockCsrfFetch.mockResolvedValueOnce(
      mockFetchResponse({ error: 'Os cenários salvos são pessoais' }, 403),
    );
    await expect(
      result.current.salvar.mutateAsync({ classe: 'acao', premissas }),
    ).rejects.toMatchObject({ status: 403, message: 'Os cenários salvos são pessoais' });
  });

  it('useApagarCenario: DELETE com CSRF e zera o salvo no cache', async () => {
    mockCsrfFetch.mockResolvedValueOnce(mockFetchResponse({ ok: true }));
    const { result, queryClient } = renderHookWithClient(() => useApagarCenario('WEGE3'));
    queryClient.setQueryData(queryKeys.analiseAtivos.cenario('WEGE3'), {
      ...cenarioAcao,
      salvo: { premissas: {}, dadosEditados: null, atualizadoEm: 'x' },
    });
    await result.current.mutateAsync();
    expect(mockCsrfFetch).toHaveBeenCalledWith('/api/analise-ativos/cenarios/WEGE3', {
      method: 'DELETE',
    });
    expect(
      queryClient.getQueryData<CenariosResposta>(queryKeys.analiseAtivos.cenario('WEGE3'))?.salvo,
    ).toBeNull();
  });

  it('baixarCsvRaioX: nome do Content-Disposition e download por <a>', async () => {
    const resp = {
      ok: true,
      status: 200,
      blob: async () => new Blob(['﻿Linha;2025'], { type: 'text/csv' }),
      headers: new Headers({
        'Content-Disposition': 'attachment; filename="raio-x_WEGE3_2026-10-08.csv"',
      }),
    } as unknown as Response;
    const fetchMock = vi.fn().mockResolvedValue(resp);
    vi.stubGlobal('fetch', fetchMock);
    const criar = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: criar, revokeObjectURL: vi.fn() }));
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const r = await baixarCsvRaioX('WEGE3');
    expect(r.nome).toBe('raio-x_WEGE3_2026-10-08.csv');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/analise-ativos/ativos/WEGE3/raio-x?formato=csv');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin' });
    expect(clique).toHaveBeenCalledTimes(1);
    clique.mockRestore();
  });

  it('baixarCsvRaioX: sem Content-Disposition usa raio-x_<TICKER>_<hoje>.csv; erro HTTP rejeita', async () => {
    const resp = {
      ok: true,
      status: 200,
      blob: async () => new Blob(['x']),
      headers: new Headers(),
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp));
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() }),
    );
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const r = await baixarCsvRaioX('HGLG11');
    expect(r.nome).toMatch(/^raio-x_HGLG11_\d{4}-\d{2}-\d{2}\.csv$/);
    clique.mockRestore();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse({ error: 'x' }, 404)));
    await expect(baixarCsvRaioX('HGLG11')).rejects.toMatchObject({ status: 404 });
  });
});
