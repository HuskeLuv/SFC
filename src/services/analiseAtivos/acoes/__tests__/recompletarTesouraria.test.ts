/**
 * --recompletar-campos=tesouraria: a tesouraria por classe vem da composição do MESMO documento, na
 * escala da contagem gravada, e só entra se ON + PN bater com a tesouraria total já gravada.
 */
import { describe, expect, it } from 'vitest';
import { propostaTesouraria } from '@/services/analiseAtivos/acoes/sincronizarCvmCias';

describe('propostaTesouraria', () => {
  it('fonte dfp/itr: composição em unidades', () => {
    expect(
      propostaTesouraria({ fonte: 'dfp', tesouraria: 300 }, { tesOn: 100, tesPn: 200 }),
    ).toEqual({ tesourariaOn: 100, tesourariaPn: 200 });
    expect(propostaTesouraria({ fonte: 'itr', tesouraria: 0 }, { tesOn: 0, tesPn: 0 })).toEqual({
      tesourariaOn: 0,
      tesourariaPn: 0,
    });
  });

  it('fonte ×1000: composição em milhares vira unidades', () => {
    expect(
      propostaTesouraria(
        { fonte: 'dfp_x1000', tesouraria: 3_000_000 },
        { tesOn: 1000, tesPn: 2000 },
      ),
    ).toEqual({ tesourariaOn: 1_000_000, tesourariaPn: 2_000_000 });
  });

  it('ON + PN diferente do total gravado ⇒ divergente (não preenche)', () => {
    expect(propostaTesouraria({ fonte: 'dfp', tesouraria: 999 }, { tesOn: 100, tesPn: 200 })).toBe(
      'divergente',
    );
  });

  it('fonte sem classe ou sem total ⇒ sem_classe', () => {
    expect(
      propostaTesouraria({ fonte: 'fre_f', tesouraria: 300 }, { tesOn: 100, tesPn: 200 }),
    ).toBe('sem_classe');
    expect(propostaTesouraria({ fonte: 'dfp', tesouraria: null }, { tesOn: 100, tesPn: 200 })).toBe(
      'sem_classe',
    );
  });
});
