import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITES_CACHE_BLOCO_D, getBoundedTtlCache } from '@/lib/boundedTtlCache';

let n = 0;
const ns = () => `teste-bounded-${++n}`;

describe('boundedTtlCache', () => {
  afterEach(() => vi.useRealTimers());

  it('nunca passa de maxKeys (1.000 chaves distintas)', () => {
    const c = getBoundedTtlCache<number>(ns(), { maxKeys: 300 });
    for (let i = 0; i < 1000; i += 1) {
      c.set(`k${i}`, i, 60_000);
      expect(c.tamanho()).toBeLessThanOrEqual(300);
    }
    expect(c.tamanho()).toBe(300);
    // ficaram as 300 mais recentes
    expect(c.get('k699')).toBeUndefined();
    expect(c.get('k700')).toBe(700);
    expect(c.get('k999')).toBe(999);
  });

  it('LRU: get reinsere a chave, que deixa de ser a próxima a sair', () => {
    const c = getBoundedTtlCache<string>(ns(), { maxKeys: 3 });
    c.set('a', 'A', 60_000);
    c.set('b', 'B', 60_000);
    c.set('c', 'C', 60_000);
    expect(c.get('a')).toBe('A'); // 'a' vira a mais recente; 'b' é a mais antiga
    c.set('d', 'D', 60_000);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe('A');
    expect(c.get('c')).toBe('C');
    expect(c.get('d')).toBe('D');
  });

  it('set de chave existente atualiza o valor sem crescer e a torna a mais recente', () => {
    const c = getBoundedTtlCache<number>(ns(), { maxKeys: 2 });
    c.set('a', 1, 60_000);
    c.set('b', 2, 60_000);
    c.set('a', 3, 60_000);
    expect(c.tamanho()).toBe(2);
    c.set('c', 4, 60_000); // sai 'b'
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(3);
  });

  it('expira no get e libera a vaga', () => {
    vi.useFakeTimers();
    const c = getBoundedTtlCache<number>(ns(), { maxKeys: 5 });
    c.set('a', 1, 1_000);
    vi.advanceTimersByTime(999);
    expect(c.get('a')).toBe(1);
    vi.advanceTimersByTime(2);
    expect(c.get('a')).toBeUndefined();
    expect(c.tamanho()).toBe(0);
  });

  it('o mesmo namespace devolve o mesmo store; del e limpar', () => {
    const nome = ns();
    getBoundedTtlCache<number>(nome, { maxKeys: 10 }).set('x', 1, 60_000);
    const c = getBoundedTtlCache<number>(nome, { maxKeys: 10 });
    expect(c.get('x')).toBe(1);
    c.del('x');
    expect(c.get('x')).toBeUndefined();
    c.set('y', 2, 60_000);
    c.limpar();
    expect(c.tamanho()).toBe(0);
  });

  it('maxKeys inválido lança; limites do bloco D', () => {
    expect(() => getBoundedTtlCache(ns(), { maxKeys: 0 })).toThrow(/maxKeys/);
    expect(() => getBoundedTtlCache(ns(), { maxKeys: 1.5 })).toThrow(/maxKeys/);
    expect(LIMITES_CACHE_BLOCO_D).toEqual({
      analiseAtivosRaioX: 400,
      analiseComparador: 300,
      analiseCenariosBase: 400,
    });
  });
});
