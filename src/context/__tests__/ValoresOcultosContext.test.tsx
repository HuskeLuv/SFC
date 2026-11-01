// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';

const navegacao = vi.hoisted(() => ({ pathname: '/carteira' }));
vi.mock('next/navigation', () => ({ usePathname: () => navegacao.pathname }));

import {
  ValoresOcultosCobertura,
  ValoresOcultosProvider,
  useValoresOcultos,
} from '../ValoresOcultosContext';

/** BroadcastChannel em memória (o jsdom não tem). */
class CanalFalso {
  static instancias: CanalFalso[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  postMessage = vi.fn((data: unknown) => {
    for (const outro of CanalFalso.instancias) {
      if (outro !== this && outro.nome === this.nome) outro.onmessage?.({ data } as MessageEvent);
    }
  });
  close = vi.fn(() => {
    CanalFalso.instancias = CanalFalso.instancias.filter((c) => c !== this);
  });
  constructor(public nome: string) {
    CanalFalso.instancias.push(this);
  }
}

const fetchMock = vi.fn();

function wrapper(habilitado: boolean, inicial: boolean) {
  return function ComProvider({ children }: { children: React.ReactNode }) {
    return (
      <ValoresOcultosProvider habilitado={habilitado} inicial={inicial}>
        {children}
      </ValoresOcultosProvider>
    );
  };
}

const limparCookie = () => {
  document.cookie = 'mf_valores_ocultos=; Path=/; Max-Age=0';
};

describe('ValoresOcultosContext', () => {
  beforeEach(() => {
    navegacao.pathname = '/carteira';
    fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('BroadcastChannel', CanalFalso);
    CanalFalso.instancias = [];
    document.documentElement.removeAttribute('data-valores-ocultos');
    document.cookie = 'csrf-token=tok123; Path=/';
    limparCookie();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fora do provider: padrão inerte, sem erro', () => {
    const { result } = renderHook(() => useValoresOcultos());
    expect(result.current).toMatchObject({
      habilitado: false,
      ocultos: false,
      ativo: false,
      rotaCoberta: false,
    });
    expect(result.current.mascarar('R$ 10,00')).toBe('R$ 10,00');
    act(() => result.current.alternar());
    expect(result.current.ocultos).toBe(false);
  });

  it('estado inicial vem do cookie lido no servidor', () => {
    const { result } = renderHook(() => useValoresOcultos(), { wrapper: wrapper(true, true) });
    expect(result.current).toMatchObject({ habilitado: true, ocultos: true, ativo: true });
    expect(result.current.mascarar('Saldo R$ 10,00')).toBe('Saldo R$ •••••');
  });

  it('alternar: atributo no <html>, cookie otimista, POST com CSRF e anúncio', async () => {
    const { result } = renderHook(() => useValoresOcultos(), { wrapper: wrapper(true, false) });
    expect(document.documentElement.hasAttribute('data-valores-ocultos')).toBe(false);

    act(() => result.current.alternar());

    expect(result.current.ocultos).toBe(true);
    expect(document.documentElement.hasAttribute('data-valores-ocultos')).toBe(true);
    expect(document.cookie).toContain('mf_valores_ocultos=1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/preferencias/valores-ocultos');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ ocultos: true });
    expect(new Headers(init.headers).get('x-csrf-token')).toBe('tok123');
    expect(init.credentials).toBe('include');
    expect(screen.getByRole('status')).toHaveTextContent('Valores ocultos');

    act(() => result.current.alternar());
    expect(document.documentElement.hasAttribute('data-valores-ocultos')).toBe(false);
    expect(document.cookie).not.toContain('mf_valores_ocultos=1');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ ocultos: false });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Valores visíveis'));
  });

  it('POST falhou (offline): tenta de novo no evento online', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useValoresOcultos(), { wrapper: wrapper(true, false) });
    act(() => result.current.definir(true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ ocultos: true });
    // Gravou: um novo 'online' não reenvia.
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sincroniza outra aba pelo BroadcastChannel', () => {
    const a = renderHook(() => useValoresOcultos(), { wrapper: wrapper(true, false) });
    const b = renderHook(() => useValoresOcultos(), { wrapper: wrapper(true, false) });
    act(() => a.result.current.alternar());
    expect(b.result.current.ocultos).toBe(true);
    // A outra aba não reenvia o POST.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('habilitado=false: inerte (nada de atributo, cookie, fetch nem anúncio)', () => {
    const { result } = renderHook(() => useValoresOcultos(), { wrapper: wrapper(false, true) });
    expect(result.current).toMatchObject({ habilitado: false, ocultos: false, ativo: false });
    act(() => result.current.alternar());
    expect(result.current.ocultos).toBe(false);
    expect(document.documentElement.hasAttribute('data-valores-ocultos')).toBe(false);
    expect(document.cookie).not.toContain('mf_valores_ocultos=1');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
    expect(CanalFalso.instancias).toHaveLength(0);
  });

  it('ativo só nas rotas cobertas; a cobertura local vale em qualquer rota', () => {
    navegacao.pathname = '/fluxodecaixa';
    const { result } = renderHook(() => useValoresOcultos(), { wrapper: wrapper(true, true) });
    expect(result.current).toMatchObject({ ocultos: true, rotaCoberta: false, ativo: false });
    expect(result.current.mascarar('R$ 1,00')).toBe('R$ 1,00');

    const Sonda = () => <span>{String(useValoresOcultos().ativo)}</span>;
    render(
      <ValoresOcultosProvider habilitado inicial>
        <ValoresOcultosCobertura>
          <Sonda />
        </ValoresOcultosCobertura>
      </ValoresOcultosProvider>,
    );
    expect(screen.getByText('true')).toBeInTheDocument();
  });

  it('sub-rotas de /ativos, /carteira e do consultor são cobertas', () => {
    for (const rota of ['/ativos/abc', '/carteira', '/consultor/c1', '/dashboard/consultor']) {
      navegacao.pathname = rota;
      const { result, unmount } = renderHook(() => useValoresOcultos(), {
        wrapper: wrapper(true, true),
      });
      expect(result.current.ativo).toBe(true);
      unmount();
    }
  });
});
