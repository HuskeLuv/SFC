/**
 * Casos-limite do Valuation medidos na Fase A (regras-spec.md §1 "Casos-limite") e regras 4, 7 e 8
 * do relatório.
 */
import { describe, expect, it } from 'vitest';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import {
  arredondar,
  formatarComSinalBR,
  formatarNumeroBR,
} from '@/services/analiseAtivos/regras/valuation/arredondamento';
import { barraPosicao } from '@/services/analiseAtivos/regras/valuation/barraPosicao';
import { validarPremissa } from '@/services/analiseAtivos/regras/valuation/cenario';
import { metaDeRenda } from '@/services/analiseAtivos/regras/valuation/metaRenda';
import {
  bazin,
  comMargem,
  gordon,
  multiploAlvo,
  pvpAlvo,
  rendaDesejada,
  suaPosicao,
  vsCotacaoPct,
} from '@/services/analiseAtivos/regras/valuation/metodos';
import { textoStatusBarra } from '@/services/analiseAtivos/textos';

const P = SCORING_PARAMS_V1;

describe('barra de posição — média negativa (regra 7)', () => {
  it('Net debt/EBITDA −0,25 contra média −0,908 ⇒ "+72%" (acima), nunca "−72%"', () => {
    const h = [-1.46, -1.64, -1.27, -1.11, -1.07, -0.87, -0.56, -0.61, -0.24, -0.25];
    const b = barraPosicao(-0.25, h, 'multiplo', P);
    expect(arredondar(b.media as number, 3)).toBe(-0.908);
    expect(b.status).toMatchObject({ tipo: 'variacao_pct', valor: 72 });
    const texto = textoStatusBarra(b.status!, b.nPontos);
    expect(texto.startsWith('+72%')).toBe(true);
    expect(texto).not.toContain('−72');
  });

  it('anos com P/L ≤ 0 saem de mín/média/máx e do mínimo de 5 pontos', () => {
    const h = [12, -8, 15, 0, 18, 20, -3];
    const b = barraPosicao(16, h, 'multiplo', P, { excluirNaoPositivos: true });
    expect(b.nPontos).toBe(4);
    expect(b.visivel).toBe(false);
    const b2 = barraPosicao(16, [...h, 14], 'multiplo', P, { excluirNaoPositivos: true });
    expect(b2.nPontos).toBe(5);
    expect(b2.min).toBe(12);
    expect(b2.media).toBeCloseTo((12 + 15 + 18 + 20 + 14) / 5, 10);
  });

  it('valor atual ≤ 0 com exclusão: barra visível sem status (não comparável)', () => {
    const b = barraPosicao(-5, [10, 12, 14, 16, 18], 'multiplo', P, { excluirNaoPositivos: true });
    expect(b.visivel).toBe(true);
    expect(b.status).toBeNull();
  });

  it('|variação| < 3% ⇒ na média; ≥ 3% ⇒ variação arredondada a 0 casas', () => {
    const h = [10, 10, 10, 10, 10];
    expect(barraPosicao(10.29, h, 'multiplo', P).status).toMatchObject({ tipo: 'na_media' });
    expect(barraPosicao(10.31, h, 'multiplo', P).status).toMatchObject({
      tipo: 'variacao_pct',
      valor: 3,
    });
  });

  it('percentual: |Δ| < 0,15 p.p. ⇒ na média', () => {
    const h = [5, 5, 5, 5, 5];
    expect(barraPosicao(5.14, h, 'percentual', P).status).toMatchObject({ tipo: 'na_media' });
    expect(barraPosicao(4.8, h, 'percentual', P).status).toMatchObject({
      tipo: 'variacao_pp',
      valor: -0.2,
      extremo: 'menor',
    });
  });

  it('média perto de zero: |Δ| < 0,05 ⇒ na média; senão acima', () => {
    const h = [0.1, 0.2, 0.3, 0.2, 0.2];
    expect(barraPosicao(0.23, h, 'multiplo', P).status).toMatchObject({ tipo: 'na_media' });
    expect(barraPosicao(0.28, h, 'multiplo', P).status).toMatchObject({ tipo: 'acima' });
  });
});

describe('Meta de renda (regra 8)', () => {
  it('1.700/mês com rendimento 2,55 ⇒ 8.000 cotas (não 8.001)', () => {
    expect(metaDeRenda(1700, 2.55, 100, 0)?.cotas).toBe(8000);
    expect(metaDeRenda(1700, 5.1, 100, 0)?.cotas).toBe(4000);
    expect(metaDeRenda(2300, 1.15, 100, 0)?.cotas).toBe(24000);
  });

  it('rendimento 0 ou negativo ⇒ null (nunca Infinity)', () => {
    expect(metaDeRenda(1000, 0, 158.2, 0)).toBeNull();
    expect(metaDeRenda(1000, -1, 158.2, 0)).toBeNull();
    expect(metaDeRenda(1000, null, 158.2, 0)).toBeNull();
  });

  it('posição maior que a meta ⇒ faltam 0', () => {
    expect(metaDeRenda(1000, 13.2, 158.2, 2000)?.faltam).toBe(0);
  });
});

describe('base ≤ 0 e premissas fora do limite ⇒ — (regra 4)', () => {
  it('múltiplo alvo com LPA −0,50 ⇒ —', () => {
    expect(multiploAlvo(22.3, -0.5)).toBeNull();
    expect(multiploAlvo(22.3, 0)).toBeNull();
  });

  it('yield 0,05% (abaixo do limite 0,1%) ⇒ —', () => {
    expect(bazin(0.84, 0.05)).toBeNull();
    expect(rendaDesejada(13.2, 0.05)).toBeNull();
    expect(bazin(0.84, 30.5)).toBeNull();
    expect(bazin(0.84, 0.1)).toBeCloseTo(840, 8);
  });

  it('DPA ausente/zero ⇒ —; rendimento zero ⇒ —', () => {
    expect(bazin(null, 6)).toBeNull();
    expect(bazin(0, 6)).toBeNull();
    expect(rendaDesejada(0, 8)).toBeNull();
    expect(gordon(0, 8, 13)).toBeNull();
    expect(pvpAlvo(1, 0)).toBeNull();
  });

  it('Gordon com g fora de 0–20 ou k fora de 1–30 ⇒ —', () => {
    expect(gordon(0.84, 21, 25)).toBeNull();
    expect(gordon(0.84, 5, 31)).toBeNull();
    expect(gordon(0.84, 14, 13)).toBeNull();
  });

  it('margem fora de 0–50 ⇒ —; cotação ≤ 0 ⇒ —', () => {
    expect(comMargem(14, 55)).toBeNull();
    expect(vsCotacaoPct(14, 0)).toBeNull();
  });

  it('sua posição com LPA ≤ 0 ⇒ múltiplo —', () => {
    expect(suaPosicao({ pm: 38.6, lpa: -1, dpa: 0.84 }).multiploSobreCusto).toBeNull();
  });
});

describe('validarPremissa', () => {
  it('aceita vírgula ou ponto e aplica os limites', () => {
    expect(validarPremissa('yieldPct', '6,5')).toBe(6.5);
    expect(validarPremissa('yieldPct', '6.5')).toBe(6.5);
    expect(validarPremissa('yieldPct', '0,05')).toBeNull();
    expect(validarPremissa('kPct', 0.5)).toBeNull();
    expect(validarPremissa('gPct', 'abc')).toBeNull();
  });

  it('margem em passos de 5', () => {
    expect(validarPremissa('margemPct', 20)).toBe(20);
    expect(validarPremissa('margemPct', 22)).toBeNull();
    expect(validarPremissa('margemPct', 55)).toBeNull();
  });
});

describe('arredondar (half-up decimal)', () => {
  it('1,005 ⇒ 1,01; 57,4545 ⇒ 57,45; −73,23 ⇒ −73', () => {
    expect(arredondar(1.005, 2)).toBe(1.01);
    expect(arredondar(57.4545, 2)).toBe(57.45);
    expect(arredondar(-73.23, 0)).toBe(-73);
    expect(arredondar(-0.5, 0)).toBe(-1);
    expect(arredondar(2.5, 0)).toBe(3);
    expect(arredondar(1e-9, 2)).toBe(0);
  });

  it('formatação brasileira', () => {
    expect(formatarNumeroBR(143962, 2)).toBe('143.962,00');
    expect(formatarComSinalBR(4.26, 1)).toBe('+4,3');
    expect(formatarComSinalBR(-72.4, 0)).toBe('−72');
  });
});
