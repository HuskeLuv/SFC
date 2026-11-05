// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';

const mockCsrfFetch = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: mockCsrfFetch }) }));

import { useSimulacaoPgbl } from '../pgblMarcacoes';

const salvo = (planos: Record<string, unknown> = {}, campos: Record<string, string> = {}) =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ ano: 2026, campos, planos, salvoEm: null }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mockCsrfFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ ok: true, salvoEm: '2026-11-05T20:00:00.000Z' }),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('useSimulacaoPgbl', () => {
  it('carrega o que está salvo e grava as mudanças num PUT só, com o estado mais recente', async () => {
    vi.stubGlobal('fetch', salvo({ p1: { tipo: 'vgbl' } }, { inss: '9.000,00' }));
    const { result } = renderHookWithClient(() => useSimulacaoPgbl(2026));
    await waitFor(() => expect(result.current.campos.inss).toBe('9.000,00'));
    expect(result.current.marcas).toEqual({ p1: 'vgbl' });

    act(() => {
      result.current.setCampo('rendaTributavel', '100');
      result.current.setCampo('rendaTributavel', '120.000,00');
      result.current.marcarRegime('p1', 'regressivo');
    });
    await waitFor(() => expect(result.current.campos.rendaTributavel).toBe('120.000,00'));

    await waitFor(() => expect(mockCsrfFetch).toHaveBeenCalledTimes(1), { timeout: 2000 });
    const [url, init] = mockCsrfFetch.mock.calls[0];
    expect(url).toBe('/api/analises/ir-pgbl/simulacao');
    expect(JSON.parse(init.body)).toEqual({
      ano: 2026,
      campos: { inss: '9.000,00', rendaTributavel: '120.000,00' },
      planos: { p1: { tipo: 'vgbl', regime: 'regressivo' } },
    });
    await waitFor(() => expect(result.current.estado).toBe('salvo'));
  });

  it('leva a marcação antiga do navegador para o servidor e apaga a chave local', async () => {
    window.localStorage.setItem('mf-ir-pgbl-planos', JSON.stringify({ p1: 'pgbl', p2: 'x' }));
    vi.stubGlobal('fetch', salvo());
    const { result } = renderHookWithClient(() => useSimulacaoPgbl(2026));
    await waitFor(() => expect(result.current.marcas).toEqual({ p1: 'pgbl' }));
    await waitFor(() => expect(mockCsrfFetch).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(JSON.parse(mockCsrfFetch.mock.calls[0][1].body).planos).toEqual({
      p1: { tipo: 'pgbl' },
    });
    await waitFor(() => expect(window.localStorage.getItem('mf-ir-pgbl-planos')).toBeNull());
  });
});
