// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readMesParam, writeMesParam } from '../monthParam';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('readMesParam', () => {
  it('1..12 → 0..11', () => {
    expect(readMesParam('?mes=1')).toBe(0);
    expect(readMesParam('?mes=12')).toBe(11);
    expect(readMesParam('?modo=orcamento&mes=7')).toBe(6);
  });
  it('ausente ou inválido → null', () => {
    expect(readMesParam('')).toBeNull();
    expect(readMesParam('?mes=0')).toBeNull();
    expect(readMesParam('?mes=13')).toBeNull();
    expect(readMesParam('?mes=abc')).toBeNull();
    expect(readMesParam('?mes=2.5')).toBeNull();
  });
  it('lê da URL atual', () => {
    window.history.replaceState(null, '', '/fluxodecaixa?mes=3');
    expect(readMesParam()).toBe(2);
  });
});

describe('writeMesParam', () => {
  it('grava 1..12 preservando os outros parâmetros', () => {
    window.history.replaceState(null, '', '/fluxodecaixa?modo=orcamento');
    writeMesParam(8);
    expect(window.location.search).toBe('?modo=orcamento&mes=9');
    writeMesParam(null);
    expect(window.location.search).toBe('?modo=orcamento');
  });
  it('índice inválido remove o parâmetro', () => {
    window.history.replaceState(null, '', '/fluxodecaixa?mes=5');
    writeMesParam(12);
    expect(window.location.search).toBe('');
  });
});
