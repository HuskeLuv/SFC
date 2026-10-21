/**
 * fundamentei-regras (F2): seed da scoring_params v3 INERTE — sem --valido-a-partir nasce com
 * validFrom 2099-01-01 fixo (nunca new Date()); v1/v2 continuam como antes.
 */
import { describe, expect, it, vi } from 'vitest';
import { lerArgs, validFromDoSeed, VERSOES } from '../seed-scoring-params';
import { validarScoringParams } from '../../../src/services/analiseAtivos/params/obterScoringParams';
import { regrasCalculoDe } from '../../../src/services/analiseAtivos/params/scoringParamsSchema';
import { SCORING_PARAMS_V2 } from '../../../src/services/analiseAtivos/params/scoringParamsV2';

describe('seed-scoring-params --versao=3', () => {
  it('aceita a v3 e é dry-run por padrão', () => {
    expect(lerArgs(['--versao=3'])).toEqual({ versao: 3, aplicar: false, validoAPartir: null });
  });

  it('sem --valido-a-partir, validFrom = 2099-01-01 FIXO (independe do relógio)', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-20T15:00:00Z'));
      const a = validFromDoSeed(3, null).toISOString();
      vi.setSystemTime(new Date('2031-01-01T00:00:00Z'));
      const b = validFromDoSeed(3, null).toISOString();
      expect(a).toBe('2099-01-01T00:00:00.000Z');
      expect(b).toBe(a);
    } finally {
      vi.useRealTimers();
    }
  });

  it('--valido-a-partir explícito continua valendo', () => {
    const { validoAPartir } = lerArgs(['--versao=3', '--valido-a-partir=2026-11-01']);
    expect(validFromDoSeed(3, validoAPartir).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('a v1 mantém o validFrom padrão de antes', () => {
    expect(validFromDoSeed(1, null).toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });

  it('a v3 é válida pelo schema e = v2 + as regras de cálculo do desenho', () => {
    const v3 = validarScoringParams(VERSOES[3].params, 'v3');
    expect(v3.versao).toBe(3);
    expect(regrasCalculoDe(v3)).toEqual({
      payoutRegra: 'dfc',
      baseJanelaDy: 'ex',
      cortarFuturos: true,
      dpaPorExercicio: true,
      serie10aPorDtFim: true,
    });
    const {
      versao: _v,
      descricao: _d,
      payout: _p,
      proventos: _pr,
      serie10aPorDtFim: _s,
      ...resto
    } = v3;
    const { versao: _v2, descricao: _d2, ...restoV2 } = SCORING_PARAMS_V2;
    expect(resto).toEqual(restoV2);
  });
});
