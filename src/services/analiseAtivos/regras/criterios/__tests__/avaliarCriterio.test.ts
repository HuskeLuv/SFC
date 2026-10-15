import { describe, expect, it } from 'vitest';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import {
  criteriosDoPerfil,
  type CriteriaParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { avaliarCriterio } from '@/services/analiseAtivos/regras/criterios/avaliarCriterio';
import {
  avaliarAtivo,
  avaliarJanela,
  contarResultados,
  margemNaoComparavel,
} from '@/services/analiseAtivos/regras/criterios/avaliarAtivo';
import {
  anoFimGlobal,
  anoInicioJanela,
  anosDaJanela,
} from '@/services/analiseAtivos/regras/criterios/ancoraJanela';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';

const P = CRITERIA_PARAMS_V1;
const def = (perfil: 'acao' | 'fii_tijolo' | 'fii_papel', id: string) =>
  criteriosDoPerfil(P, perfil).find((d) => d.id === id)!;

const serieDe = (inicio: number, valores: Array<number | null>) =>
  Object.fromEntries(valores.map((v, i) => [inicio + i, v]));

describe('ancoraJanela', () => {
  it('anoFim = ano − 1 a partir de maio; antes, ano − 2', () => {
    expect(anoFimGlobal('2026-10-13', P)).toBe(2025);
    expect(anoFimGlobal('2026-05-01', P)).toBe(2025);
    expect(anoFimGlobal('2026-04-30', P)).toBe(2024);
    expect(anoFimGlobal('2026-01-02', P)).toBe(2024);
    expect(() => anoFimGlobal('2026-13-01', P)).toThrow();
  });

  it('anos da janela (com o ano anterior no up)', () => {
    expect(anosDaJanela(2025, 3, false)).toEqual([2023, 2024, 2025]);
    expect(anosDaJanela(2025, 3, true)).toEqual([2022, 2023, 2024, 2025]);
    expect(anosDaJanela(2025, 10, true)).toHaveLength(11);
    expect(anoInicioJanela(2025, 10)).toBe(2016);
  });
});

describe("avaliarCriterio — 'up'", () => {
  const rec = def('acao', 'rec');

  it('empate NÃO conta como crescimento', () => {
    const r = avaliarCriterio(
      {
        def: rec,
        janela: 3,
        anoFim: 2025,
        classe: 'acao',
        serie: serieDe(2022, [100, 110, 110, 120]),
      },
      P,
    );
    expect(r.estado).toBe('nao_atende');
    expect(r.n).toBe(2);
    expect(r.fato).toBe('cresceu em 2 de 3 anos · 100 → 120 (R$ mi)');
  });

  it('janela 10 usa 11 valores (2015–2025)', () => {
    const valores = Array.from({ length: 11 }, (_, i) => 100 + i * 10);
    const r = avaliarCriterio(
      { def: rec, janela: 10, anoFim: 2025, classe: 'acao', serie: serieDe(2015, valores) },
      P,
    );
    expect(r.estado).toBe('atende');
    expect(r.n).toBe(10);
    expect(r.de).toBe(10);
    expect(r.serie).toHaveLength(11);
    expect(r.serie?.[0]).toEqual({ ano: 2015, valor: 100 });
  });

  it('só os anos da janela são exigidos (ano antigo ausente não importa)', () => {
    const r = avaliarCriterio(
      {
        def: rec,
        janela: 3,
        anoFim: 2025,
        classe: 'acao',
        serie: { 2010: null, 2022: 1, 2023: 2, 2024: 3, 2025: 4 },
      },
      P,
    );
    expect(r.estado).toBe('atende');
  });

  it('null dentro da janela = sem dado (não atende por falta), com a série parcial', () => {
    const r = avaliarCriterio(
      {
        def: rec,
        janela: 3,
        anoFim: 2025,
        classe: 'acao',
        serie: serieDe(2022, [1, 2, null, 4]),
      },
      P,
    );
    expect(r).toMatchObject({
      estado: 'sem_dado',
      n: null,
      de: null,
      fato: 'sem dado nas demonstrações',
      motivo: 'sem_dado_demonstracoes',
    });
    expect(r.serie?.map((p) => p.valor)).toEqual([1, 2, null, 4]);
  });

  it('série inteira ausente = sem dado e série nula', () => {
    const r = avaliarCriterio({ def: rec, janela: 5, anoFim: 2025, classe: 'acao' }, P);
    expect(r.estado).toBe('sem_dado');
    expect(r.serie).toBeNull();
  });

  it('FII na janela 10 explica que os informes começam em 2016', () => {
    const r = avaliarCriterio(
      { def: def('fii_tijolo', 'rend'), janela: 10, anoFim: 2025, classe: 'fii', serie: {} },
      P,
    );
    expect(r.fato).toBe(TEXTOS_CRITERIOS.fatos.semDadoFii10);
  });

  it('formato n2 e unidade R$ (rendimento por cota)', () => {
    const r = avaliarCriterio(
      {
        def: def('fii_tijolo', 'rend'),
        janela: 3,
        anoFim: 2025,
        classe: 'fii',
        serie: serieDe(2022, [9.24, 10.1, 11, 11.8]),
      },
      P,
    );
    expect(r.fato).toBe('cresceu em 3 de 3 anos · 9,24 → 11,80 (R$)');
  });
});

describe("avaliarCriterio — 'pos', 'max' e Dív.líq/EBITDA", () => {
  it('margem: positiva em n de J com o mínimo', () => {
    const r = avaliarCriterio(
      {
        def: def('acao', 'mg'),
        janela: 3,
        anoFim: 2025,
        classe: 'acao',
        serie: serieDe(2023, [12.3, -0.4, 5]),
      },
      P,
    );
    expect(r.estado).toBe('nao_atende');
    expect(r.fato).toBe('positiva em 2 de 3 anos · mín. −0,4%');
  });

  it('máximo −0,3 (caixa líquido) aparece como "máx. 0,0×"', () => {
    const r = avaliarCriterio(
      {
        def: def('acao', 'dl'),
        janela: 5,
        anoFim: 2025,
        classe: 'acao',
        serie: serieDe(2021, [-0.86, -0.31, -0.6, -0.52, -0.3]),
      },
      P,
    );
    expect(r.estado).toBe('atende');
    expect(r.fato).toBe('dentro do limite em 5 de 5 anos · máx. 0,0× (limite 3,0×)');
  });

  it('sem exibirNegativoComoZero o fato mostra o máximo real (port fiel do fmtC)', () => {
    const p: CriteriaParams = { ...P, dlEbitda: { ...P.dlEbitda, exibirNegativoComoZero: false } };
    const r = avaliarCriterio(
      {
        def: def('acao', 'dl'),
        janela: 3,
        anoFim: 2025,
        classe: 'acao',
        serie: serieDe(2023, [-0.6, -0.52, -0.3]),
      },
      p,
    );
    expect(r.fato).toBe('dentro do limite em 3 de 3 anos · máx. −0,3× (limite 3,0×)');
  });

  it('limite é "≤": exatamente 3,0× está dentro', () => {
    const r = avaliarCriterio(
      {
        def: def('acao', 'dl'),
        janela: 3,
        anoFim: 2025,
        classe: 'acao',
        serie: serieDe(2023, [3, 2.9, 1]),
      },
      P,
    );
    expect(r.estado).toBe('atende');
  });

  it('EBITDA ≤ 0 com dívida líquida positiva = fora, com o fato "EBITDA ≤ 0 em AAAA"', () => {
    const r = avaliarCriterio(
      {
        def: def('acao', 'dl'),
        janela: 5,
        anoFim: 2025,
        classe: 'acao',
        serie: serieDe(2021, [1, Number.POSITIVE_INFINITY, 2, Number.POSITIVE_INFINITY, 0.5]),
      },
      P,
    );
    expect(r).toMatchObject({
      estado: 'nao_atende',
      n: 3,
      de: 5,
      fato: 'EBITDA ≤ 0 em 2024',
      motivo: 'ebitda_nao_positivo',
    });
    // o JSON gravado nunca leva Infinity
    expect(r.serie?.map((p) => p.valor)).toEqual([1, null, 2, null, 0.5]);
  });

  it('Obrigações/PL: máximo e limite em %', () => {
    const r = avaliarCriterio(
      {
        def: def('fii_tijolo', 'alav'),
        janela: 5,
        anoFim: 2025,
        classe: 'fii',
        serie: serieDe(2021, [12.5, 14.6, 20.2, 17.6, 16.2]),
      },
      P,
    );
    expect(r.estado).toBe('nao_atende');
    expect(r.fato).toBe('dentro do limite em 4 de 5 anos · máx. 20,2% (limite 20,0%)');
  });

  it("'min' (params com critério de mínimo) usa o mínimo e '≥'", () => {
    const base = def('fii_tijolo', 'alav');
    const r = avaliarCriterio(
      {
        def: { ...base, tipo: 'min', limite: 10 },
        janela: 3,
        anoFim: 2025,
        classe: 'fii',
        serie: serieDe(2023, [10, 12, 9]),
      },
      P,
    );
    expect(r.fato).toBe('dentro do limite em 2 de 3 anos · mín. 9,0% (limite 10,0%)');
  });
});

describe('avaliarCriterio — não se aplica (D4) e sem fonte (D3)', () => {
  it('financeira: EBITDA, Dív/EBITDA e FCL não se aplicam, com o texto por critério', () => {
    const ebitda = avaliarCriterio(
      { def: def('acao', 'ebitda'), janela: 5, anoFim: 2025, classe: 'acao', naoSeAplica: true },
      P,
    );
    expect(ebitda).toMatchObject({
      estado: 'nao_se_aplica',
      n: null,
      de: null,
      motivo: 'instituicao_financeira',
      fato: TEXTOS_CRITERIOS.motivos.instituicao_financeira,
      serie: null,
    });
    const fcl = avaliarCriterio(
      { def: def('acao', 'fcl'), janela: 5, anoFim: 2025, classe: 'acao', naoSeAplica: true },
      P,
    );
    expect(fcl.fato).toBe(TEXTOS_CRITERIOS.motivos.instituicao_financeira_fcl);
  });

  it('vacância, inadimplência e LTV: sem dado para todos (sem fonte confiável), mesmo com série', () => {
    for (const [perfil, id] of [
      ['fii_tijolo', 'vac'],
      ['fii_papel', 'inad'],
      ['fii_papel', 'ltv'],
    ] as const) {
      const r = avaliarCriterio(
        {
          def: def(perfil, id),
          janela: 3,
          anoFim: 2025,
          classe: 'fii',
          serie: serieDe(2023, [1, 1, 1]),
        },
        P,
      );
      expect(r.estado).toBe('sem_dado');
      expect(r.motivo).toBe('sem_fonte_confiavel');
      expect(r.fato).toBe(
        (TEXTOS_CRITERIOS.motivos.sem_fonte_confiavel as Record<string, string>)[id],
      );
    }
  });
});

describe('avaliarJanela / avaliarAtivo — contagem factual', () => {
  const entrada = {
    symbol: 'ITUB4',
    classe: 'acao' as const,
    perfil: 'acao_financeira' as const,
    anoFim: 2025,
    series: {
      revenue: serieDe(2020, [1, 2, 3, 4, 5, 6]),
      net_income: serieDe(2020, [1, 2, 3, 2, 5, 6]),
      net_margin: serieDe(2021, [10, 11, 12, 13, 14]),
    },
    meses: null,
  };

  it('financeira: n de 3 (EBITDA, Dív/EBITDA e FCL fora do denominador)', () => {
    const j = avaliarJanela(entrada, 5, P);
    expect(j.aplicaveis).toBe(3);
    expect(j.atendidos).toBe(2);
    expect(j.semDado).toBe(false);
    expect(j.resultados.map((r) => r.id)).toEqual(['rec', 'luc', 'ebitda', 'mg', 'dl', 'fcl']);
    expect(j.resultados.filter((r) => r.estado === 'nao_se_aplica')).toHaveLength(3);
    expect(j).toMatchObject({ anoInicio: 2021, anoFim: 2025 });
  });

  it('financeira sem margem na janela mas com lucro (holding/banco no individual): margem não se aplica, n de 2', () => {
    const holding = {
      ...entrada,
      series: {
        revenue: serieDe(2020, [null, null, null, null, null, null]),
        net_income: serieDe(2020, [1, 2, 3, 4, 5, 6]),
        net_margin: serieDe(2021, [null, null, null, null, null]),
      },
    };
    expect(margemNaoComparavel(holding, 5)).toBe(true);
    const j = avaliarJanela(holding, 5, P);
    const mg = j.resultados.find((r) => r.id === 'mg');
    expect(mg).toMatchObject({
      estado: 'nao_se_aplica',
      motivo: 'instituicao_financeira',
      fato: TEXTOS_CRITERIOS.motivos.instituicao_financeira_mg,
    });
    expect(j.aplicaveis).toBe(2);
  });

  it('margem segue sem dado quando falta só um ano, quando o lucro também falta, ou em não financeira', () => {
    const umAno = {
      ...entrada,
      series: { ...entrada.series, net_margin: serieDe(2021, [10, 11, null, 13, 14]) },
    };
    expect(margemNaoComparavel(umAno, 5)).toBe(false);
    expect(avaliarJanela(umAno, 5, P).resultados.find((r) => r.id === 'mg')?.estado).toBe(
      'sem_dado',
    );
    const semLucro = {
      ...entrada,
      series: {
        net_income: serieDe(2020, [null, null, null, null, null, null]),
        net_margin: serieDe(2021, [null, null, null, null, null]),
      },
    };
    expect(margemNaoComparavel(semLucro, 5)).toBe(false);
    const naoFinanceira = {
      ...entrada,
      perfil: 'acao' as const,
      series: { ...entrada.series, net_margin: serieDe(2021, [null, null, null, null, null]) },
    };
    expect(margemNaoComparavel(naoFinanceira, 5)).toBe(false);
  });

  it('as 3 janelas do params, com a paramsVersion', () => {
    const a = avaliarAtivo(entrada, P, 7);
    expect(Object.keys(a.janelas).sort()).toEqual(['10', '3', '5']);
    expect(a.paramsVersion).toBe(7);
    expect(a.janelas['10'].semDado).toBe(true);
  });

  it('semDado só quando nenhum critério aplicável tem dado', () => {
    expect(
      contarResultados([
        { id: 'rec', estado: 'sem_dado', n: null, de: null, fato: '', serie: null },
        { id: 'dl', estado: 'nao_se_aplica', n: null, de: null, fato: '', serie: null },
      ]).semDado,
    ).toBe(true);
    expect(
      contarResultados([
        { id: 'rec', estado: 'sem_dado', n: null, de: null, fato: '', serie: null },
        { id: 'luc', estado: 'nao_atende', n: 1, de: 3, fato: '', serie: null },
      ]).semDado,
    ).toBe(false);
  });

  it('nenhum fato gerado tem linguagem proibida (nota, melhor, recomend…)', () => {
    const a = avaliarAtivo(entrada, P, 1);
    for (const j of Object.values(a.janelas)) {
      for (const r of j.resultados) expect(encontrarProibidasV2(r.fato), r.fato).toEqual([]);
    }
  });
});
