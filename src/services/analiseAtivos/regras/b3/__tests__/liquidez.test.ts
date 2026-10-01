import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { filtrarRegistro, parseLinhaCotahist } from '@/services/analiseAtivos/regras/b3/cotahist';
import { liquidez } from '@/services/analiseAtivos/regras/b3/liquidez';
import { pregoesEntre } from '@/services/analiseAtivos/regras/comum/pregoes';

const p = SCORING_PARAMS_V1;

// Linhas REAIS do COTAHIST_M082026 (ago/2026, 21 pregões): HGLG11 (todos os dias) e NVHO11 (14 dias).
const REGS = readFileSync(
  path.join(__dirname, 'fixtures', 'cotahist_m082026_hglg11_nvho11.txt'),
  'latin1',
)
  .split('\r\n')
  .map(parseLinhaCotahist)
  .filter((r) => r !== null && filtrarRegistro(r));

const serie = (symbol: string) =>
  REGS.filter((r) => r!.symbol === symbol).map((r) => ({ date: r!.data, volumeFin: r!.volumeFin }));

const AGO_2026 = pregoesEntre('2026-08-01', '2026-08-31');

describe('liquidez (regra 29)', () => {
  it('agosto/2026 tem 21 pregões no calendário B3', () => {
    expect(AGO_2026).toHaveLength(21);
  });

  it('HGLG11 ago/26 ≈ R$ 18,9 mi/dia (21 pregões com negócio; bate com o relatório da Fase A)', () => {
    const r = liquidez(serie('HGLG11'), AGO_2026, p);
    expect(r.pregoesComNegocio21).toBe(21);
    expect(r.volumeMedio21 / 1e6).toBeCloseTo(18.9, 1);
    expect(r.volumeMedio21).toBeCloseTo(18_903_188.96, 1);
    expect(r.baixaLiquidez).toBe(false);
    expect(r.negociadoUltimos30).toBe(true);
  });

  it('NVHO11: 14 pregões com negócio em 21 ⇒ baixaLiquidez; dia sem negócio conta 0 na média', () => {
    const s = serie('NVHO11');
    expect(s).toHaveLength(14);
    const r = liquidez(s, AGO_2026, p);
    expect(r.pregoesComNegocio21).toBe(14);
    expect(r.baixaLiquidez).toBe(true);
    const soma = s.reduce((a, l) => a + l.volumeFin, 0);
    expect(r.volumeMedio21).toBeCloseTo(soma / 21, 6);
    expect(r.volumeMedio21).toBeLessThan(soma / 14);
  });

  it('15 pregões com negócio = limite ⇒ não é baixa liquidez', () => {
    const s = AGO_2026.slice(0, 15).map((d) => ({ date: d, volumeFin: 1000 }));
    expect(liquidez(s, AGO_2026, p).baixaLiquidez).toBe(false);
    expect(liquidez(s.slice(1), AGO_2026, p).baixaLiquidez).toBe(true);
  });

  it('janela rolante: só os últimos 21 pregões do calendário entram', () => {
    const cal = pregoesEntre('2026-07-01', '2026-08-31');
    const antigo = cal.slice(0, 5).map((d) => ({ date: d, volumeFin: 1e9 }));
    const r = liquidez([...antigo, ...serie('HGLG11')], cal, p);
    expect(r.volumeMedio21).toBeCloseTo(18_903_188.96, 1);
  });

  it('negociadoUltimos30: negócio só há 31+ pregões ⇒ false; há 30 ⇒ true', () => {
    const cal = pregoesEntre('2026-06-01', '2026-08-31');
    const n = cal.length;
    expect(liquidez([{ date: cal[n - 31], volumeFin: 5e5 }], cal, p).negociadoUltimos30).toBe(
      false,
    );
    const r = liquidez([{ date: cal[n - 30], volumeFin: 5e5 }], cal, p);
    expect(r.negociadoUltimos30).toBe(true);
    expect(r.pregoesComNegocio21).toBe(0);
    expect(r.volumeMedio21).toBe(0);
  });

  it('sem nenhuma linha: volume 0, baixa liquidez, não negociado', () => {
    expect(liquidez([], AGO_2026, p)).toEqual({
      volumeMedio21: 0,
      pregoesComNegocio21: 0,
      baixaLiquidez: true,
      negociadoUltimos30: false,
    });
  });
});
