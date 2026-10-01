import { describe, expect, it } from 'vitest';
import {
  ausente,
  combinar,
  deNumero,
  ehOk,
  mapearValor,
  naoSeAplica,
  ok,
  valorOuNull,
} from '@/services/analiseAtivos/regras/comum/valor';
import type { Valor } from '@/services/analiseAtivos/tipos';

describe('três estados (regra 1)', () => {
  it('deNumero(0) é ok(0) — zero é dado, não ausência', () => {
    expect(deNumero(0)).toEqual({ estado: 'ok', valor: 0 });
    expect(ehOk(deNumero(0))).toBe(true);
  });

  it('deNumero(null/undefined) é ausente com motivo', () => {
    expect(deNumero(null)).toEqual({ estado: 'ausente', motivo: 'sem_dado_fonte' });
    expect(deNumero(undefined, 'sem_preco')).toEqual({ estado: 'ausente', motivo: 'sem_preco' });
  });

  it('NaN e ±Infinity são ausentes', () => {
    expect(deNumero(NaN).estado).toBe('ausente');
    expect(deNumero(Infinity).estado).toBe('ausente');
    expect(deNumero(-Infinity).estado).toBe('ausente');
  });

  it('combinar: n/a vence ausente, nas duas ordens', () => {
    const na = naoSeAplica('financeira');
    const au = ausente('sem_dado_fonte');
    expect(combinar(na, au, (a: number, b: number) => a + b)).toEqual(na);
    expect(combinar(au, na, (a: number, b: number) => a + b)).toEqual(na);
  });

  it('combinar: ausente propaga; dois ok aplicam a função', () => {
    expect(combinar(ok(1), ausente('sem_acoes'), (a: number, b: number) => a / b).estado).toBe(
      'ausente',
    );
    expect(combinar(ok(10), ok(4), (a: number, b: number) => a / b)).toEqual(ok(2.5));
  });

  it('mapearValor só transforma ok e preserva o motivo dos demais', () => {
    expect(mapearValor(ok(2), (x) => x * 3)).toEqual(ok(6));
    expect(mapearValor(naoSeAplica('fof', 'x'), (x: number) => x * 3)).toEqual(
      naoSeAplica('fof', 'x'),
    );
  });

  it('valorOuNull devolve null para ausente e n/a, e 0 para ok(0)', () => {
    expect(valorOuNull(ok(0))).toBe(0);
    expect(valorOuNull(ausente('outro'))).toBeNull();
    expect(valorOuNull(naoSeAplica('fof'))).toBeNull();
  });

  it('nunca `null <= 1`: papel sem dados não atende critério "menor é melhor" (caso do protótipo)', () => {
    // Protótipo: DL/EBITDA null ⇒ `null <= 1` === true ⇒ atendia 5/5 sem dado nenhum.
    const atende = (v: Valor<number>, limite: number) => ehOk(v) && v.valor <= limite;
    const semDados = [null, undefined, NaN].map((n) => deNumero(n));
    expect(semDados.filter((v) => atende(v, 1))).toHaveLength(0);
    expect(atende(deNumero(0), 1)).toBe(true);
  });
});
