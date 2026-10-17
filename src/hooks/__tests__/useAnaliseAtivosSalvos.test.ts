// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import { queryKeys } from '@/lib/queryKeys';
import { LIMITES_SALVOS } from '@/services/analiseAtivos/salvos/contrato';
import type { IndiceSalvosResposta } from '@/types/analiseAtivosSalvos';

const mocks = vi.hoisted(() => ({ csrfFetch: vi.fn() }));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: mocks.csrfFetch }) }));

import {
  ID_LISTA_PROVISORIA,
  baixarPdfComparacao,
  pertencaOtimista,
  useDefinirSalvo,
} from '@/hooks/useAnaliseAtivosSalvos';

const INDICE: IndiceSalvosResposta = {
  porTicker: { ITUB4: ['l1'] },
  listas: [{ id: 'l1', nome: 'Salvos' }],
  limites: LIMITES_SALVOS,
  podeSalvar: true,
  motivoSemSalvar: null,
};

describe('useAnaliseAtivosSalvos', () => {
  beforeEach(() => mocks.csrfFetch.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it('pertencaOtimista: sentinela vira a lista única ou a provisória', () => {
    expect(pertencaOtimista(INDICE, ['padrao'])).toEqual(['l1']);
    expect(pertencaOtimista({ ...INDICE, listas: [] }, ['padrao'])).toEqual([ID_LISTA_PROVISORIA]);
    expect(pertencaOtimista(INDICE, ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('useDefinirSalvo: otimista no índice e reverte em erro', async () => {
    let soltar: (r: Response) => void = () => undefined;
    mocks.csrfFetch.mockReturnValue(new Promise<Response>((r) => (soltar = r)));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse(INDICE)));
    const { result, queryClient } = renderHookWithClient(() => useDefinirSalvo());
    queryClient.setQueryDefaults(queryKeys.analiseAtivos.salvosIndice(), { gcTime: Infinity });
    queryClient.setQueryData(queryKeys.analiseAtivos.salvosIndice(), INDICE);
    act(() => result.current.mutate({ ticker: 'WEGE3', listaIds: ['padrao'] }));
    await waitFor(() =>
      expect(
        queryClient.getQueryData<IndiceSalvosResposta>(queryKeys.analiseAtivos.salvosIndice())
          ?.porTicker.WEGE3,
      ).toEqual(['l1']),
    );
    const [url, init] = mocks.csrfFetch.mock.calls[0];
    expect(url).toBe('/api/analise-ativos/salvos/WEGE3');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ listaIds: ['padrao'] });
    soltar(mockFetchResponse({ error: 'Escolha em quais listas salvar.' }, 400));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(
      queryClient.getQueryData<IndiceSalvosResposta>(queryKeys.analiseAtivos.salvosIndice())
        ?.porTicker.WEGE3,
    ).toBeUndefined();
  });

  it('baixarPdfComparacao: no computador baixa pelo <a download> com o nome do servidor', async () => {
    const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => blob,
        headers: new Headers({
          'Content-Disposition': 'attachment; filename="comparacao-acoes-WEGE3-2026-10-16.pdf"',
        }),
      }),
    );
    const criar = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: criar, revokeObjectURL: vi.fn() }));
    const r = await baixarPdfComparacao({ classe: 'acao', tickers: ['WEGE3'], janela: 5 });
    expect(r).toEqual({ estado: 'baixado', nome: 'comparacao-acoes-WEGE3-2026-10-16.pdf' });
    expect(criar).toHaveBeenCalled();
  });

  it('baixarPdfComparacao: 429 rejeita com o status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse({ error: 'limite' }, 429)));
    await expect(baixarPdfComparacao({ classe: 'acao', tickers: ['WEGE3'] })).rejects.toMatchObject(
      { status: 429 },
    );
  });
});
