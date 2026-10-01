import { describe, expect, it } from 'vitest';
import { SCORING_PARAMS_V1 as P } from '@/services/analiseAtivos/params/scoringParamsV1';
import { aplicarHisterese, mesAnterior } from '@/services/analiseAtivos/regras/fii/histerese';
import type { FiiTipo } from '@/services/analiseAtivos/tipos';

const hist = (...tipos: Array<[string, FiiTipo]>) =>
  tipos.map(([refMonth, tipoComposicao]) => ({ refMonth, tipoComposicao }));

describe('aplicarHisterese (N = 3 meses seguidos)', () => {
  it('tijolo → papel → papel mantém tijolo', () => {
    const h = hist(['2026-05-01', 'tijolo'], ['2026-06-01', 'papel'], ['2026-07-01', 'papel']);
    expect(aplicarHisterese(h, 'tijolo', null, P)).toEqual({
      tipoVigente: 'tijolo',
      mudouEm: null,
    });
  });

  it('3 meses papel ⇒ papel (muda no 3º mês)', () => {
    const h = hist(['2026-05-01', 'papel'], ['2026-06-01', 'papel'], ['2026-07-01', 'papel']);
    expect(aplicarHisterese(h, 'tijolo', null, P)).toEqual({
      tipoVigente: 'papel',
      mudouEm: '2026-07-01',
    });
  });

  it('lacuna de mês quebra a sequência', () => {
    const h = hist(['2026-04-01', 'papel'], ['2026-06-01', 'papel'], ['2026-07-01', 'papel']);
    expect(aplicarHisterese(h, 'tijolo', null, P).tipoVigente).toBe('tijolo');
  });

  it('override FiiTipoOverride vence sempre', () => {
    const h = hist(['2026-05-01', 'papel'], ['2026-06-01', 'papel'], ['2026-07-01', 'papel']);
    expect(aplicarHisterese(h, 'tijolo', 'fof', P)).toEqual({
      tipoVigente: 'fof',
      mudouEm: '2026-07-01',
    });
    expect(aplicarHisterese(h, 'fof', 'fof', P)).toEqual({ tipoVigente: 'fof', mudouEm: null });
  });

  it('fundo novo (sem vigente anterior) nasce com o tipo do mês', () => {
    expect(aplicarHisterese(hist(['2026-07-01', 'papel']), null, null, P).tipoVigente).toBe(
      'papel',
    );
  });

  it('indefinido num mês não derruba o vigente', () => {
    const h = hist(['2026-06-01', 'tijolo'], ['2026-07-01', 'indefinido']);
    expect(aplicarHisterese(h, 'tijolo', null, P).tipoVigente).toBe('tijolo');
  });

  it('mesAnterior atravessa o ano', () => {
    expect(mesAnterior('2026-01-01')).toBe('2025-12-01');
  });
});
