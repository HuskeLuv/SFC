import { describe, expect, it } from 'vitest';
import { arredondarComoExibido, calcularDestaque, type CandidatoDestaque } from '../destaque';

const ok = (
  ticker: string,
  valor: number,
  conferencia: CandidatoDestaque['conferencia'] = null,
) => ({
  ticker,
  valor: { estado: 'ok' as const, valor },
  conferencia,
});
const ausente = (ticker: string): CandidatoDestaque => ({
  ticker,
  valor: { estado: 'ausente', motivo: 'sem_dado_fonte', texto: '—' },
  conferencia: null,
});
const na = (ticker: string): CandidatoDestaque => ({
  ticker,
  valor: { estado: 'nao_se_aplica', motivo: 'financeira', texto: 'n/a' },
  conferencia: null,
});

describe('calcularDestaque', () => {
  it('maior e menor', () => {
    const c = [ok('WEGE3', 33.2), ok('ITUB4', 22.4), ok('TAEE11', 20.1)];
    expect(calcularDestaque(c, 'maior', 'pct').destaque).toBe('WEGE3');
    expect(calcularDestaque(c, 'menor', 'pct').destaque).toBe('TAEE11');
  });

  it('empate exato e por arredondamento (valor como exibido)', () => {
    expect(calcularDestaque([ok('A', 12), ok('B', 12)], 'maior', 'inteiro')).toEqual({
      destaque: null,
      motivoSemDestaque: 'empate',
    });
    // 1,234 e 1,231 aparecem "1,23" com 2 casas ⇒ empate
    expect(
      calcularDestaque([ok('A', 1.234), ok('B', 1.231)], 'menor', 'numero2').motivoSemDestaque,
    ).toBe('empate');
    // com 1 casa, 8,64 → 8,6 e 8,56 → 8,6
    expect(
      calcularDestaque([ok('A', 8.64), ok('B', 8.56)], 'menor', 'numero').motivoSemDestaque,
    ).toBe('empate');
  });

  it('um valor só (o resto ausente/n/a) ⇒ sem ★', () => {
    const r = calcularDestaque([ok('A', 5), ausente('B'), na('C')], 'maior', 'pct');
    expect(r).toEqual({ destaque: null, motivoSemDestaque: 'menos_de_2' });
  });

  it('n/a não disputa; os aplicáveis disputam', () => {
    expect(calcularDestaque([ok('A', 3), na('B'), ok('C', 1)], 'menor', 'numero2').destaque).toBe(
      'C',
    );
  });

  it('selo e ocultar ficam fora do ★ (DY de WEGE3 e ITUB4 em conferência, sobra TAEE11)', () => {
    const r = calcularDestaque(
      [ok('WEGE3', 4, 'selo'), ok('ITUB4', 7.3, 'selo'), ok('TAEE11', 7.4)],
      'maior',
      'pct',
    );
    expect(r.motivoSemDestaque).toBe('menos_de_2');
    const r2 = calcularDestaque([ok('A', 9, 'ocultar'), ok('B', 1), ok('C', 2)], 'maior', 'pct');
    expect(r2.destaque).toBe('C');
  });

  it('perto_de_1: 0,98 / 1,03 / 1,10 ⇒ 0,98', () => {
    const r = calcularDestaque(
      [ok('A', 1.03), ok('B', 0.98), ok('C', 1.1)],
      'perto_de_1',
      'numero2',
    );
    expect(r.destaque).toBe('B');
    // 0,97 e 1,03 equidistantes ⇒ empate
    expect(
      calcularDestaque([ok('A', 0.97), ok('B', 1.03)], 'perto_de_1', 'numero2').motivoSemDestaque,
    ).toBe('empate');
  });

  it('neutro nunca tem ★', () => {
    expect(calcularDestaque([ok('A', 1), ok('B', 2)], 'neutro', 'pct')).toEqual({
      destaque: null,
      motivoSemDestaque: 'neutro',
    });
  });

  it('sem validação CVM e tipos diferentes ⇒ sem ★ com o motivo', () => {
    const c = [ok('A', 1), ok('B', 2)];
    expect(calcularDestaque(c, 'menor', 'pct', { semValidacaoCvm: true }).motivoSemDestaque).toBe(
      'sem_validacao_cvm',
    );
    expect(
      calcularDestaque(c, 'menor', 'numero2', { tiposDiferentes: true }).motivoSemDestaque,
    ).toBe('tipos_diferentes');
  });

  it('dívida líquida negativa (caixa líquido) conta como menor', () => {
    const r = calcularDestaque([ok('WEGE3', -0.42), ok('TAEE11', 3.48)], 'menor', 'numero2');
    expect(r.destaque).toBe('WEGE3');
  });

  it('menor_positivo: P/L ≤ 0 fica fora', () => {
    const r = calcularDestaque(
      [ok('AURE3', -4.1), ok('WEGE3', 33.7), ok('TAEE11', 8.6)],
      'menor_positivo',
      'numero',
    );
    expect(r.destaque).toBe('TAEE11');
    expect(
      calcularDestaque([ok('A', -1), ok('B', 5)], 'menor_positivo', 'numero').motivoSemDestaque,
    ).toBe('menos_de_2');
  });

  it('arredondarComoExibido não devolve −0', () => {
    expect(Object.is(arredondarComoExibido(-0.004, 'numero2'), 0)).toBe(true);
    expect(arredondarComoExibido(33.249, 'pct')).toBe(33.25);
  });
});
