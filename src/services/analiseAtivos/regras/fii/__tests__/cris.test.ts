import { describe, expect, it } from 'vitest';
import {
  chaveCri,
  contarCrisDistintos,
  ehLinhaCri,
} from '@/services/analiseAtivos/regras/fii/cris';
import { CNPJ, trimestralFixture } from './fixturesFii';

describe('contarCrisDistintos (regra 25) — 2T26 real', () => {
  it('KNIP11 ⇒ 119 CRIs distintos', async () => {
    const [t] = await trimestralFixture({ ativo: 'inf_trimestral_fii_ativo_2026_knip.csv' });
    expect(t.cnpj).toBe(CNPJ.KNIP);
    expect(t.refQuarter).toBe('2026-06-30');
    expect(contarCrisDistintos(t.ativos).nCri).toBe(119);
  });

  it('KNCR11: 147 linhas de CRI ⇒ 96 CRIs distintos; maior CRI em % do total', async () => {
    const [t] = await trimestralFixture({ ativo: 'inf_trimestral_fii_ativo_2026_kncr.csv' });
    expect(t.ativos.filter((a) => ehLinhaCri(a.tipo))).toHaveLength(147);
    const r = contarCrisDistintos(t.ativos);
    expect(r.nCri).toBe(96);
    expect(r.valorCri).toBeGreaterThan(0);
    expect(r.maiorCriPct).toBeGreaterThan(0);
    expect(r.maiorCriPct).toBeLessThan(100);
  });

  it('código CETIP no nome decide; sem código usa emissor|emissão|série', () => {
    expect(
      chaveCri({ emissor: 'OPEA', nomeAtivo: 'CRI 23L1952070', emissao: '1', serie: '2' }),
    ).toBe('23L1952070');
    expect(chaveCri({ emissor: 'opea ', nomeAtivo: 'CRI X', emissao: '1', serie: '2' })).toBe(
      'OPEA|1|2',
    );
  });

  it('sem CRI ⇒ nCri 0 e maiorCriPct null', () => {
    expect(contarCrisDistintos([])).toEqual({ nCri: 0, valorCri: 0, maiorCriPct: null });
  });
});
