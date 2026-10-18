/**
 * Vacância trimestral em conferência (backtest 18/10/2026, A4). Séries REAIS de produção
 * (fii_quarterly, informe trimestral da CVM, lidas em 18/10/2026): fixtures/vacanciaBacktest.json.
 */
import { describe, expect, it } from 'vitest';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import {
  conferirVacancia,
  liberadaPor,
  type TrimestreVacancia,
} from '@/services/analiseAtivos/regras/fii/saneamentoVacancia';
import fixture from './fixtures/vacanciaBacktest.json';

const P = SCORING_PARAMS_V1.sanidade.fii;
const series = fixture.series as Record<string, Array<[string, number, number | null]>>;

function serie(ticker: string): TrimestreVacancia[] {
  return series[ticker].map(([refQuarter, vacanciaPct, receitaAluguel]) => ({
    refQuarter,
    vacanciaPct,
    receitaAluguel,
  }));
}

const marcados = (ticker: string) =>
  [...conferirVacancia(serie(ticker), P).values()].map((c) => [c.refQuarter, c.regra, c.chave]);

describe('conferirVacancia — casos do backtest (ocupação no campo de vacância)', () => {
  it('HSML11: 4T25, 1T26 e 2T26 (~91%) em conferência como ocupação; a série até o 3T25 fica', () => {
    const r = conferirVacancia(serie('HSML11'), P);
    expect([...r.keys()]).toEqual(['2025-12-31', '2026-03-31', '2026-06-30']);
    const q4 = r.get('2025-12-31')!;
    expect(q4).toMatchObject({ regra: 'vacancia_ocupacao', chave: '2025-12' });
    expect(q4.referenciaPct).toBeCloseTo(2.73, 2);
    expect(q4.valorPct).toBeCloseTo(91.36, 2);
    // o episódio inteiro tem a mesma chave (um caso de curadoria só)
    expect(new Set([...r.values()].map((c) => c.chave))).toEqual(new Set(['2025-12']));
  });

  it('XPML11 1T26 (4,0% → 91,8%) em conferência; o 2T26 (5,2%) volta ao normal', () => {
    expect(marcados('XPML11')).toEqual([['2026-03-31', 'vacancia_ocupacao', '2026-03']]);
  });

  it('AJFI11 4T24 (6,7% → 93,6%) só aquele trimestre', () => {
    expect(marcados('AJFI11')).toEqual([['2024-12-31', 'vacancia_ocupacao', '2024-12']]);
  });

  it('APXM11, LASC11 e CPOF11: os trimestres que pulam para ~100% com a receita estável', () => {
    expect(marcados('APXM11').map((m) => m[0])).toEqual([
      '2023-09-30',
      '2024-12-31',
      '2025-12-31',
      '2026-06-30',
    ]);
    expect(marcados('LASC11')).toEqual([
      ['2025-06-30', 'vacancia_ocupacao', '2025-06'],
      ['2026-06-30', 'vacancia_ocupacao', '2026-06'],
    ]);
    expect(marcados('CPOF11').map((m) => m[0])).toEqual([
      '2023-06-30',
      '2024-06-30',
      '2025-03-31',
      '2026-03-31',
    ]);
  });

  it('BROF11 1T26 (9,6% → 72,6%): salto brusco não complementar', () => {
    expect(marcados('BROF11')).toEqual([['2026-03-31', 'vacancia_salto', '2026-03']]);
  });
});

describe('conferirVacancia — mudanças reais não ficam presas em conferência', () => {
  it('HGLG11 (variação de poucos p.p.): nada', () => {
    expect(marcados('HGLG11')).toEqual([]);
  });

  it('CTXT11 2020–2021 (9,5% → 58% → ~97%) com a receita caindo a ~2%: aceito pela receita', () => {
    // o 4T20 (58%, receita 0,93×) só confirma no 1T21 (receita 0,61×): fica aceito retroativamente
    expect(marcados('CTXT11')).toEqual([]);
  });

  it('FAMB11 e PRSV11 (prédio esvaziado, receita → 0): aceitos pela receita', () => {
    expect(marcados('FAMB11')).toEqual([]);
    expect(marcados('PRSV11')).toEqual([]);
  });

  it('RBOP11 3T23 (4,3% → 82,8%): o 1º trimestre fica aceito quando a receita cai no 4T23', () => {
    expect(marcados('RBOP11')).toEqual([]);
  });

  it('JSRE11 4T17 (54% → 0%, descida) e FTCE11 (0% → ~37%, receita mantida): aceitos em 3 trimestres', () => {
    expect(marcados('JSRE11')).toEqual([]);
    // FTCE11: o patamar de ~37% (2021–2024) é aceito; ficam só os "0%" soltos no meio dele
    expect(marcados('FTCE11')).toEqual([
      ['2021-06-30', 'vacancia_salto', '2021-06'],
      ['2023-03-31', 'vacancia_salto', '2023-03'],
    ]);
  });
});

describe('conferirVacancia — regras', () => {
  const t = (refQuarter: string, vacanciaPct: number | null, receitaAluguel = 100) => ({
    refQuarter,
    vacanciaPct,
    receitaAluguel,
  });

  it('série de 1 ponto, vazia ou só com null: nada (o 1º valor é a referência)', () => {
    expect(conferirVacancia([], P).size).toBe(0);
    expect(conferirVacancia([t('2025-03-31', 95)], P).size).toBe(0);
    expect(conferirVacancia([t('2025-03-31', null), t('2025-06-30', null)], P).size).toBe(0);
  });

  it('null no meio fica fora da série (papel/sem imóvel não quebra a referência)', () => {
    const r = conferirVacancia([t('2025-03-31', 3), t('2025-06-30', null), t('2025-09-30', 96)], P);
    expect([...r.keys()]).toEqual(['2025-09-30']);
  });

  it('ocupação persistente NÃO é aceita pela persistência (o gestor mantém o formato)', () => {
    const r = conferirVacancia(
      [
        t('2025-03-31', 3),
        ...['2025-06-30', '2025-09-30', '2025-12-31', '2026-03-31'].map((q) => t(q, 96)),
      ],
      P,
    );
    expect(r.size).toBe(4);
  });

  it('salto não complementar persistente é aceito no 3º trimestre (retroativo ao 1º)', () => {
    const base = [t('2025-03-31', 5), t('2025-06-30', 45), t('2025-09-30', 46)];
    expect([...conferirVacancia(base, P).keys()]).toEqual(['2025-06-30', '2025-09-30']);
    expect(conferirVacancia([...base, t('2025-12-31', 47)], P).size).toBe(0);
  });

  it('liberação da curadoria (regra + chave do episódio) aceita o episódio inteiro', () => {
    const s = [t('2025-09-30', 2.7), t('2025-12-31', 91.4), t('2026-03-31', 90.1)];
    expect(conferirVacancia(s, P).size).toBe(2);
    expect(conferirVacancia(s, P, liberadaPor(['vacancia_ocupacao|2025-12'])).size).toBe(0);
    // chave de outro episódio não libera
    expect(conferirVacancia(s, P, liberadaPor(['vacancia_ocupacao|2026-03'])).size).toBe(2);
  });

  it('subida com a receita caindo o bastante é aceita na hora', () => {
    // salto 60 p.p. ⇒ receita ≤ 100 × (1 − 0,5 × 0,6) = 70
    expect(conferirVacancia([t('2025-09-30', 5), t('2025-12-31', 65, 70)], P).size).toBe(0);
    expect(conferirVacancia([t('2025-09-30', 5), t('2025-12-31', 65, 71)], P).size).toBe(1);
  });
});
