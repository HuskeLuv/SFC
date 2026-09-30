import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { parseLinhaCotahist } from '@/services/analiseAtivos/regras/b3/cotahist';
import { detectarSaltoDiario } from '@/services/analiseAtivos/regras/b3/saltoDiario';

const p = SCORING_PARAMS_V1;

// MGLU3 15/05–05/06/2024, linhas REAIS do COTAHIST_A2024: grupamento 10:1 — R$ 1,32 (24/05) ⇒ 13,15 (27/05)
const MGLU3_2024 = readFileSync(path.join(__dirname, 'fixtures', 'cotahist_amostra.txt'), 'latin1')
  .split('\r\n')
  .map(parseLinhaCotahist)
  .filter((r) => r !== null && r.symbol === 'MGLU3' && r.data.startsWith('2024'))
  .map((r) => ({ date: r!.data, closeRaw: r!.closeRaw }));

describe('detectarSaltoDiario (regra 30)', () => {
  it('a fixture tem o salto real de +896% entre 24/05 e 27/05/2024', () => {
    expect(MGLU3_2024).toHaveLength(15);
    const a = MGLU3_2024.find((l) => l.date === '2024-05-24')!;
    const b = MGLU3_2024.find((l) => l.date === '2024-05-27')!;
    expect(a.closeRaw).toBeCloseTo(1.32, 6);
    expect(b.closeRaw).toBeCloseTo(13.15, 6);
  });

  it('MGLU3 grupamento 10:1 com evento na data (BRAPI grava 24/05) ⇒ não marca', () => {
    const eventos = [{ date: '2024-05-24', fator: 0.1 }];
    expect(detectarSaltoDiario(MGLU3_2024, eventos, p)).toEqual([]);
  });

  it('idem com a data do Yahoo (27/05, primeiro dia ex) ⇒ não marca', () => {
    expect(detectarSaltoDiario(MGLU3_2024, [{ date: '2024-05-27', fator: 0.1 }], p)).toEqual([]);
  });

  it('mesmo salto sem evento ⇒ marca 27/05/2024 com variação ≈ +896%', () => {
    const r = detectarSaltoDiario(MGLU3_2024, [], p);
    expect(r).toHaveLength(1);
    expect(r[0].date).toBe('2024-05-27');
    expect(r[0].dataAnterior).toBe('2024-05-24');
    expect(r[0].variacaoPct).toBeCloseTo((13.15 / 1.32 - 1) * 100, 6);
  });

  it('evento fora da janela [pregão anterior, pregão do salto] não protege', () => {
    const r = detectarSaltoDiario(MGLU3_2024, [{ date: '2024-05-20', fator: 0.1 }], p);
    expect(r.map((s) => s.date)).toEqual(['2024-05-27']);
  });

  it('queda > 40% também marca; variação de exatamente 40% não', () => {
    const s = [
      { date: '2026-09-01', closeRaw: 10 },
      { date: '2026-09-02', closeRaw: 14 },
      { date: '2026-09-03', closeRaw: 7 },
    ];
    const r = detectarSaltoDiario(s, [], p);
    expect(r.map((x) => x.date)).toEqual(['2026-09-03']);
    expect(r[0].variacaoPct).toBeCloseTo(-50, 6);
  });

  it('série fora de ordem é ordenada; preço 0 é ignorado', () => {
    const s = [
      { date: '2026-09-03', closeRaw: 20 },
      { date: '2026-09-01', closeRaw: 10 },
      { date: '2026-09-02', closeRaw: 0 },
    ];
    expect(detectarSaltoDiario(s, [], p).map((x) => x.dataAnterior)).toEqual(['2026-09-01']);
  });
});
