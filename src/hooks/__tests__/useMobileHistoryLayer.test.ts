// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMobileHistoryLayer } from '../useMobileHistoryLayer';

/** Simula o "voltar": volta o state/URL e dispara o popstate (o jsdom não faz isso sozinho). */
function voltarPara(state: unknown, url = '/analise-ativos?ordem=pl') {
  window.history.replaceState(state, '', url);
  window.dispatchEvent(new PopStateEvent('popstate', { state }));
}

describe('useMobileHistoryLayer', () => {
  beforeEach(() => {
    window.history.replaceState({ base: 1 }, '', '/analise-ativos?ordem=pl');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('desabilitado (desktop): não toca no history', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const back = vi.spyOn(window.history, 'back');
    const onFechar = vi.fn();
    const { rerender } = renderHook(
      ({ aberto }) => useMobileHistoryLayer(aberto, onFechar, false),
      {
        initialProps: { aberto: false },
      },
    );
    rerender({ aberto: true });
    rerender({ aberto: false });
    expect(push).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });

  it('abrir empilha na mesma URL; voltar do sistema fecha o painel', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const onFechar = vi.fn();
    const { rerender } = renderHook(({ aberto }) => useMobileHistoryLayer(aberto, onFechar, true), {
      initialProps: { aberto: false },
    });
    rerender({ aberto: true });
    expect(push).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('?ordem=pl');
    expect((window.history.state as Record<string, unknown>).base).toBe(1);

    act(() => voltarPara({ base: 1 }));
    expect(onFechar).toHaveBeenCalledTimes(1);
    rerender({ aberto: false });
    // fechado pelo voltar: a entrada já saiu, nada de back extra
    expect(back).not.toHaveBeenCalled();
  });

  it('fechar pelo app (X/fundo) volta pela entrada empilhada, sem deixar órfã', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const onFechar = vi.fn();
    const { rerender } = renderHook(({ aberto }) => useMobileHistoryLayer(aberto, onFechar, true), {
      initialProps: { aberto: true },
    });
    rerender({ aberto: false });
    expect(back).toHaveBeenCalledTimes(1);
    // o popstate desse back não é "voltar do sistema"
    act(() => voltarPara({ base: 1 }));
    expect(onFechar).not.toHaveBeenCalled();
  });

  it('fecharEntao: a ação (router.replace/push) roda só depois do back', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const acao = vi.fn();
    let aberto = true;
    const onFechar = vi.fn(() => {
      aberto = false;
    });
    const { result, rerender } = renderHook(() => useMobileHistoryLayer(aberto, onFechar, true));
    act(() => result.current.fecharEntao(acao));
    expect(onFechar).toHaveBeenCalledTimes(1);
    rerender();
    expect(back).toHaveBeenCalledTimes(1);
    expect(acao).not.toHaveBeenCalled();
    act(() => voltarPara({ base: 1 }));
    expect(acao).toHaveBeenCalledTimes(1);
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it('fecharEntao no desktop roda a ação na hora', () => {
    const back = vi.spyOn(window.history, 'back');
    const acao = vi.fn();
    const onFechar = vi.fn();
    const { result } = renderHook(() => useMobileHistoryLayer(true, onFechar, false));
    act(() => result.current.fecharEntao(acao));
    expect(onFechar).toHaveBeenCalledTimes(1);
    expect(acao).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  });

  it('painéis empilhados: o voltar fecha só o de cima', () => {
    vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const fecharBaixo = vi.fn();
    const fecharCima = vi.fn();
    renderHook(() => useMobileHistoryLayer(true, fecharBaixo, true));
    const estadoBaixo = window.history.state;
    renderHook(() => useMobileHistoryLayer(true, fecharCima, true));
    act(() => voltarPara(estadoBaixo));
    expect(fecharCima).toHaveBeenCalledTimes(1);
    expect(fecharBaixo).not.toHaveBeenCalled();
  });
});
