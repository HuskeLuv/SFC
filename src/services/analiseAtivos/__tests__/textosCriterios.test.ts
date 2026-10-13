import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDERS_CRITERIOS,
  TEXTOS_CRITERIOS,
  formatarTexto,
  formatarValorCriterio,
  textoContador,
  textoJanela,
} from '@/services/analiseAtivos/textosCriterios';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import { folhasTexto } from '@/services/analiseAtivos/regras/comum/varreduraTextos';

const FOLHAS = folhasTexto(TEXTOS_CRITERIOS, 'TEXTOS_CRITERIOS');

describe('textosCriterios', () => {
  it('nenhuma palavra proibida (linguagemV2) em nenhuma folha', () => {
    const achados = FOLHAS.map(([k, v]) => [k, encontrarProibidasV2(v)] as const).filter(
      ([, p]) => p.length > 0,
    );
    expect(achados).toEqual([]);
  });

  it('rótulos e definições do criteria_params v1 também passam pela varredura', () => {
    const achados = folhasTexto(CRITERIA_PARAMS_V1.perfis)
      .filter(([k]) => /\.(rotulo|definicao)$/.test(k))
      .map(([k, v]) => [k, encontrarProibidasV2(v)] as const)
      .filter(([, p]) => p.length > 0);
    expect(achados).toEqual([]);
  });

  it('placeholders: só os permitidos e todos preenchidos', () => {
    const vars = Object.fromEntries(PLACEHOLDERS_CRITERIOS.map((p) => [p, 'X']));
    for (const [k, v] of FOLHAS) {
      for (const m of v.matchAll(/\{(\w+)\}/g)) {
        expect(PLACEHOLDERS_CRITERIOS as readonly string[], `${k}: {${m[1]}}`).toContain(m[1]);
      }
      expect(formatarTexto(v, vars), k).not.toMatch(/[{}]/);
    }
  });

  it('marcas neutras ✓ / — / n/a e "sem dado" conta como não atende', () => {
    expect(TEXTOS_CRITERIOS.marcas).toEqual({
      atende: '✓',
      nao_atende: '—',
      sem_dado: '—',
      nao_se_aplica: 'n/a',
    });
    expect(TEXTOS_CRITERIOS.estados.sem_dado).toBe('não atende · sem dado nas demonstrações');
  });

  it('fatos dos casos 24–29 montados com os templates', () => {
    const f = TEXTOS_CRITERIOS.fatos;
    expect(
      formatarTexto(f.upComUnidade, {
        n: 5,
        total: 5,
        inicio: formatarValorCriterio(17500, 'n'),
        fim: formatarValorCriterio(40800, 'n'),
        unidade: 'R$ mi',
      }),
    ).toBe('cresceu em 5 de 5 anos · 17.500 → 40.800 (R$ mi)');
    expect(
      formatarTexto(f.max, {
        n: 5,
        total: 5,
        max: formatarValorCriterio(0, 'x'),
        limite: formatarValorCriterio(3, 'x'),
      }),
    ).toBe('dentro do limite em 5 de 5 anos · máx. 0,0× (limite 3,0×)');
    expect(formatarTexto(f.pos, { n: 0, total: 5, min: formatarValorCriterio(-10.5, '%') })).toBe(
      'positiva em 0 de 5 anos · mín. −10,5%',
    );
    expect(formatarTexto(f.meses, { n: 48, total: 60 })).toBe('48 de 60 meses com rendimento pago');
    expect(f.semDado).toBe('sem dado nas demonstrações');
  });

  it('formatarValorCriterio = fmtC do screen.js', () => {
    expect(formatarValorCriterio(-0.03, 'x')).toBe('0,0×');
    expect(formatarValorCriterio(-0.5, 'x')).toBe('−0,5×');
    expect(formatarValorCriterio(0.04, '%')).toBe('0,0%');
    expect(formatarValorCriterio(0.04, 'n2')).toBe('0,04');
    expect(formatarValorCriterio(1777, 'n')).toBe('1.777');
    expect(formatarValorCriterio(13.2, 'n1')).toBe('13,2');
    expect(formatarValorCriterio(null, 'n')).toBe('—');
    expect(formatarValorCriterio(Number.NaN, '%')).toBe('—');
  });

  it('contador e janela', () => {
    expect(textoContador(3, 6)).toBe('3 de 6');
    expect(textoJanela(5)).toBe('5 anos');
    expect(textoJanela(10, true)).toBe('10a');
  });

  it('vocabulário de desvio sem "falta"/"aporte"', () => {
    const desvio = folhasTexto(TEXTOS_CRITERIOS.desvio).map(([, v]) => v);
    expect(desvio.filter((v) => /falta|aporte|compre/i.test(v))).toEqual([]);
    expect(TEXTOS_CRITERIOS.desvio.alvo).toBe('alvo planejado por você: {pct}');
  });
});
