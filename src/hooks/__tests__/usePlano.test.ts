// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import { AssinaturasChaveContext, buscarAssinaturaMe, usePlano } from '@/hooks/usePlano';
import { ASSINATURA_ME_DESLIGADA, type AssinaturaMe } from '@/types/assinatura';

const ME_BASIC: AssinaturaMe = {
  ...ASSINATURA_ME_DESLIGADA,
  plano: 'basic',
  origem: 'basic',
  podeAssinar: true,
  habilitado: true,
};

function renderComChave(chave: boolean) {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(AssinaturasChaveContext.Provider, { value: chave }, children),
    );
  return renderHook(() => usePlano(), { wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buscarAssinaturaMe', () => {
  it('404 (F1 ausente) = chave desligada, Advanced', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse({}, 404)));
    expect(await buscarAssinaturaMe()).toEqual(ASSINATURA_ME_DESLIGADA);
  });

  it('erro de rede ou corpo estranho = chave desligada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('rede')));
    expect(await buscarAssinaturaMe()).toEqual(ASSINATURA_ME_DESLIGADA);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse({ plano: 'gold' })));
    expect(await buscarAssinaturaMe()).toEqual(ASSINATURA_ME_DESLIGADA);
  });

  it('habilitado:false no servidor força Advanced', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockFetchResponse({ ...ME_BASIC, habilitado: false })),
    );
    const me = await buscarAssinaturaMe();
    expect(me.plano).toBe('adv');
    expect(me.habilitado).toBe(false);
  });

  it('manda o session_id da volta do Checkout', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(ME_BASIC));
    vi.stubGlobal('fetch', fetchMock);
    await buscarAssinaturaMe({ sessionId: 'cs_test_1' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/assinaturas/me?session_id=cs_test_1');
  });
});

describe('usePlano', () => {
  it('chave desligada (ou fora do provider): Advanced sem chamar o /me', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => usePlano());
    expect(result.current.plano).toBe('adv');
    expect(result.current.habilitado).toBe(false);
    expect(result.current.carregando).toBe(false);
    expect(result.current.libera('adv')).toBe(true);
    const desligada = renderComChave(false);
    expect(desligada.result.current.libera('adv')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('chave ligada: espera o /me (nada liberado) e depois aplica o plano', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse(ME_BASIC)));
    const { result } = renderComChave(true);
    expect(result.current.carregando).toBe(true);
    expect(result.current.libera('pro')).toBe(false);
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.plano).toBe('basic');
    expect(result.current.habilitado).toBe(true);
    expect(result.current.libera('basic')).toBe(true);
    expect(result.current.libera('pro')).toBe(false);
  });

  it('chave ligada mas /me 404: Advanced, tudo liberado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse({}, 404)));
    const { result } = renderComChave(true);
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.plano).toBe('adv');
    expect(result.current.libera('adv')).toBe(true);
  });
});
