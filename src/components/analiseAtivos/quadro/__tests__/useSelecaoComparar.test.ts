// @vitest-environment jsdom
/**
 * Bloco D, fatia D: seleção do modo Comparar do Quadro — limite de 4, uma classe por vez (trocar
 * de aba limpa), sessionStorage e "Comparar" habilitado a partir de 1 (decisão 13).
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAVE_SELECAO_COMPARAR,
  alternarTicker,
  lerSelecaoSalva,
  podeComparar,
  useSelecaoComparar,
} from '../useSelecaoComparar';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

const salvo = () => JSON.parse(window.sessionStorage.getItem(CHAVE_SELECAO_COMPARAR) ?? 'null');

describe('funções puras', () => {
  it('alternarTicker marca na ordem, desmarca e ignora o 5º', () => {
    let t: string[] = [];
    for (const x of ['WEGE3', 'ITUB4', 'PETR4', 'VALE3']) t = alternarTicker(t, x);
    expect(t).toEqual(['WEGE3', 'ITUB4', 'PETR4', 'VALE3']);
    expect(alternarTicker(t, 'TAEE11')).toEqual(t);
    expect(alternarTicker(t, 'ITUB4')).toEqual(['WEGE3', 'PETR4', 'VALE3']);
  });

  it('podeComparar: 0 não, 1 a 4 sim (decisão 13), 5 não', () => {
    expect(podeComparar(0)).toBe(false);
    expect(podeComparar(1)).toBe(true);
    expect(podeComparar(2)).toBe(true);
    expect(podeComparar(4)).toBe(true);
    expect(podeComparar(5)).toBe(false);
  });

  it('lerSelecaoSalva descarta lixo, classe inválida, tickers inválidos e o excesso', () => {
    expect(lerSelecaoSalva(null)).toBeNull();
    expect(lerSelecaoSalva('{')).toBeNull();
    expect(lerSelecaoSalva(JSON.stringify({ classe: 'etf', tickers: [] }))).toBeNull();
    expect(
      lerSelecaoSalva(
        JSON.stringify({
          classe: 'fii',
          tickers: ['HGLG11', 'x;=1', 'HGLG11', 'XPLG11', 'KNCR11', 'MXRF11', 'HFOF11', 3],
          ativo: true,
        }),
      ),
    ).toEqual({ classe: 'fii', tickers: ['HGLG11', 'XPLG11', 'KNCR11', 'MXRF11'], ativo: true });
  });
});

describe('useSelecaoComparar', () => {
  it('limite de 4: os demais ficam desabilitados; marcados continuam habilitados', () => {
    const { result } = renderHook(() => useSelecaoComparar('acao'));
    act(() => result.current.setAtivo(true));
    for (const t of ['WEGE3', 'ITUB4', 'PETR4', 'VALE3']) act(() => result.current.alternar(t));
    expect(result.current.cheio).toBe(true);
    expect(result.current.desabilitado('TAEE11')).toBe(true);
    expect(result.current.desabilitado('WEGE3')).toBe(false);
    act(() => result.current.alternar('TAEE11'));
    expect(result.current.tickers).toEqual(['WEGE3', 'ITUB4', 'PETR4', 'VALE3']);
    expect(result.current.href).toBe('/analise-ativos/comparador?t=WEGE3,ITUB4,PETR4,VALE3');
  });

  it('Comparar: desabilitado com 0, habilitado com 1 (decisão 13)', () => {
    const { result } = renderHook(() => useSelecaoComparar('acao'));
    expect(result.current.podeComparar).toBe(false);
    act(() => result.current.alternar('WEGE3'));
    expect(result.current.podeComparar).toBe(true);
    expect(result.current.href).toBe('/analise-ativos/comparador?t=WEGE3');
  });

  it('trocar de aba limpa a seleção (o modo continua)', () => {
    const { result, rerender } = renderHook(({ c }: { c: ClasseQuadro }) => useSelecaoComparar(c), {
      initialProps: { c: 'acao' },
    });
    act(() => result.current.setAtivo(true));
    act(() => result.current.alternar('WEGE3'));
    rerender({ c: 'fii' });
    expect(result.current.tickers).toEqual([]);
    expect(result.current.ativo).toBe(true);
    expect(salvo()).toEqual({ classe: 'fii', tickers: [], ativo: true });
    rerender({ c: 'acao' });
    expect(result.current.tickers).toEqual([]);
  });

  it('grava no sessionStorage e restaura ao remontar (voltar do Comparador)', () => {
    const a = renderHook(() => useSelecaoComparar('fii'));
    act(() => a.result.current.setAtivo(true));
    act(() => a.result.current.alternar('HGLG11'));
    act(() => a.result.current.alternar('XPLG11'));
    expect(salvo()).toEqual({ classe: 'fii', tickers: ['HGLG11', 'XPLG11'], ativo: true });
    a.unmount();
    const b = renderHook(() => useSelecaoComparar('fii'));
    expect(b.result.current.ativo).toBe(true);
    expect(b.result.current.tickers).toEqual(['HGLG11', 'XPLG11']);
  });

  it('salvo de outra classe não volta (a URL abriu na outra aba)', () => {
    window.sessionStorage.setItem(
      CHAVE_SELECAO_COMPARAR,
      JSON.stringify({ classe: 'acao', tickers: ['WEGE3'], ativo: true }),
    );
    const { result } = renderHook(() => useSelecaoComparar('fii'));
    expect(result.current.tickers).toEqual([]);
    expect(result.current.ativo).toBe(true);
  });

  it('limpar esvazia; desligar o modo sem seleção apaga a chave', () => {
    const { result } = renderHook(() => useSelecaoComparar('acao'));
    act(() => result.current.setAtivo(true));
    act(() => result.current.alternar('WEGE3'));
    act(() => result.current.limpar());
    expect(result.current.tickers).toEqual([]);
    act(() => result.current.setAtivo(false));
    expect(window.sessionStorage.getItem(CHAVE_SELECAO_COMPARAR)).toBeNull();
  });

  it('recurso desligado: modo sempre desligado e nada lido nem gravado', () => {
    window.sessionStorage.setItem(
      CHAVE_SELECAO_COMPARAR,
      JSON.stringify({ classe: 'acao', tickers: ['WEGE3'], ativo: true }),
    );
    const { result } = renderHook(() => useSelecaoComparar('acao', false));
    expect(result.current.ativo).toBe(false);
    expect(result.current.tickers).toEqual([]);
    act(() => result.current.alternar('ITUB4'));
    expect(result.current.tickers).toEqual([]);
    expect(salvo()).toEqual({ classe: 'acao', tickers: ['WEGE3'], ativo: true });
  });

  it('storage que lança não quebra a tela', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const { result } = renderHook(() => useSelecaoComparar('acao'));
    act(() => result.current.setAtivo(true));
    act(() => result.current.alternar('WEGE3'));
    expect(result.current.tickers).toEqual(['WEGE3']);
  });
});
