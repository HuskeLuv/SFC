/**
 * Contratos da F0 do fundamentei-regras no schema do scoring_params: regras de cálculo versionadas
 * (payout.regra, proventos.baseJanelaDy/cortarFuturos/dpaPorExercicio, serie10aPorDtFim), todas
 * opcionais, com padrões = comportamento de hoje (v1/v2 iguais).
 */
import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { SCORING_PARAMS_V1 } from '../scoringParamsV1';
import { SCORING_PARAMS_V2 } from '../scoringParamsV2';
import {
  REGRAS_CALCULO_PADRAO,
  regrasCalculoDe,
  scoringParamsSchema,
  type ScoringParams,
} from '../scoringParamsSchema';

/** sha256 de JSON.stringify(parse(vN)) com o schema de ANTES da F0 (main a2e7c2ff, 20/10/2026). */
const HASH_PARSE_ANTES: Record<number, string> = {
  1: 'b652feb944667233778b05c52e0babb4cb54e057d25a1ced48842141131bd5f0',
  2: '5d3901677c18b68382da00ea65a1f337f3f5f8156a78e889585b14b4438678f8',
};

const sha = (o: unknown) => createHash('sha256').update(JSON.stringify(o)).digest('hex');

describe('F0 fundamentei-regras — scoring v1/v2 inalteradas', () => {
  it.each([
    [1, SCORING_PARAMS_V1],
    [2, SCORING_PARAMS_V2],
  ] as Array<[number, ScoringParams]>)('v%i: parse igual ao de antes e padrões de hoje', (n, p) => {
    const lido = scoringParamsSchema.parse(JSON.parse(JSON.stringify(p)));
    expect(sha(lido)).toBe(HASH_PARSE_ANTES[n]);
    expect('payout' in lido).toBe(false);
    expect('proventos' in lido).toBe(false);
    expect('serie10aPorDtFim' in lido).toBe(false);
    expect(regrasCalculoDe(lido)).toEqual({
      payoutRegra: 'dmpl_dpa',
      baseJanelaDy: 'com',
      cortarFuturos: false,
      dpaPorExercicio: false,
      jcpLiquido: false,
      serie10aPorDtFim: false,
    });
  });

  it('o padrão é imutável', () => {
    expect(Object.isFrozen(REGRAS_CALCULO_PADRAO)).toBe(true);
  });
});

describe('F0 fundamentei-regras — campos novos', () => {
  const base = () => structuredClone(SCORING_PARAMS_V2) as ScoringParams;

  it('as regras da v3 (desenho) são aceitas e lidas', () => {
    const p = {
      ...base(),
      payout: { regra: 'dfc' as const },
      proventos: { baseJanelaDy: 'ex' as const, cortarFuturos: true, dpaPorExercicio: true },
      serie10aPorDtFim: true,
    };
    const lido = scoringParamsSchema.parse(p);
    expect(regrasCalculoDe(lido)).toEqual({
      payoutRegra: 'dfc',
      baseJanelaDy: 'ex',
      cortarFuturos: true,
      dpaPorExercicio: true,
      jcpLiquido: false,
      serie10aPorDtFim: true,
    });
  });

  it('jcpLiquido (v5): aceito e lido; ausente = JCP bruto', () => {
    const lido = scoringParamsSchema.parse({ ...base(), proventos: { jcpLiquido: true } });
    expect(regrasCalculoDe(lido).jcpLiquido).toBe(true);
    expect(regrasCalculoDe(scoringParamsSchema.parse(base())).jcpLiquido).toBe(false);
  });

  it('bloco parcial: o que falta fica no padrão de hoje', () => {
    const lido = scoringParamsSchema.parse({ ...base(), proventos: { cortarFuturos: true } });
    expect(regrasCalculoDe(lido)).toEqual({ ...REGRAS_CALCULO_PADRAO, cortarFuturos: true });
  });

  it('valores fora da lista e chave extra são recusados (schema estrito)', () => {
    expect(scoringParamsSchema.safeParse({ ...base(), payout: { regra: 'dmpl' } }).success).toBe(
      false,
    );
    expect(
      scoringParamsSchema.safeParse({ ...base(), proventos: { baseJanelaDy: 'pagamento' } })
        .success,
    ).toBe(false);
    expect(
      scoringParamsSchema.safeParse({ ...base(), proventos: { cortarFuturo: true } }).success,
    ).toBe(false);
    expect(
      scoringParamsSchema.safeParse({ ...base(), payout: { regra: 'dfc', extra: 1 } }).success,
    ).toBe(false);
  });
});
