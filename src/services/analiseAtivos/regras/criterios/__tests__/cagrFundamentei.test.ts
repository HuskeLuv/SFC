/**
 * fundamentei-regras (F1) — tipo 'cagr' do motor (crescimento anual composto > 0 na janela) e a
 * margem da financeira com o override por perfil. Séries SINTÉTICAS (só a regra; nenhum número de
 * terceiros): taxa = (fim ÷ início)^(1/J) − 1; base ≤ 0 pelos dois modos de cagr.baseNaoPositiva;
 * fim ≤ 0; ano faltante; J = 3/5/10.
 */
import { describe, expect, it } from 'vitest';
import {
  criteriaParamsSchema,
  type CriteriaParams,
  type DefCriterio,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V4_JSON } from '@/services/analiseAtivos/params/criteriaParamsV4';
import { avaliarJanela } from '@/services/analiseAtivos/regras/criterios/avaliarAtivo';
import {
  avaliarCriterio,
  incluiAnoAnterior,
  taxaCagr,
} from '@/services/analiseAtivos/regras/criterios/avaliarCriterio';
import type { Janela } from '@/types/analiseAtivosCriterios';

function paramsCom(ajuste: (j: Record<string, unknown>) => void): CriteriaParams {
  const json = structuredClone(CRITERIA_PARAMS_V4_JSON) as unknown as Record<string, unknown>;
  ajuste(json);
  return criteriaParamsSchema.parse(json);
}

const FIM_POSITIVO = paramsCom((j) => {
  j.cagr = { baseNaoPositiva: 'fim_positivo' };
});
const SEM_DADO = paramsCom((j) => {
  j.cagr = { baseNaoPositiva: 'sem_dado' };
});
/** sem o bloco cagr: padrão 'sem_dado' */
const SEM_BLOCO = paramsCom(() => undefined);

const REC: DefCriterio = {
  id: 'rec',
  rotulo: 'Receita com crescimento anual > 0',
  definicao: 'x',
  tipo: 'cagr',
  serie: 'revenue',
  formato: 'n',
  unidade: 'R$ mi',
};

/** série ano → valor de (anoFim − J) a anoFim */
function serie(anoFim: number, valores: number[]): Record<number, number> {
  const ini = anoFim - valores.length + 1;
  return Object.fromEntries(valores.map((v, i) => [ini + i, v]));
}

const avaliar = (valores: number[], P: CriteriaParams, janela: Janela = 5, def = REC) =>
  avaliarCriterio({ def, janela, anoFim: 2025, classe: 'acao', serie: serie(2025, valores) }, P);

describe("tipo 'cagr'", () => {
  it('lê J + 1 anos como o up', () => {
    expect(incluiAnoAnterior('cagr')).toBe(true);
    expect(incluiAnoAnterior('up')).toBe(true);
    expect(incluiAnoAnterior('pos')).toBe(false);
    const r = avaliar([100, 90, 80, 120, 130, 150], FIM_POSITIVO);
    expect(r.serie?.map((p) => p.ano)).toEqual([2020, 2021, 2022, 2023, 2024, 2025]);
  });

  it('crescimento com anos de queda no meio atende (o up não atenderia)', () => {
    const r = avaliar([100, 90, 80, 120, 130, 150], FIM_POSITIVO);
    expect(taxaCagr(100, 150, 5)).toBeCloseTo(0.0845, 4);
    expect(r).toMatchObject({ id: 'rec', estado: 'atende', n: 5, de: 5 });
    expect(r.fato).toBe('crescimento anual de 8,4% em 5 anos · 100 → 150 (R$ mi)');
  });

  it('queda na janela não atende, com a taxa negativa no fato', () => {
    const r = avaliar([200, 210, 190, 180, 170, 160], FIM_POSITIVO);
    expect(r).toMatchObject({ estado: 'nao_atende', n: 0, de: 5 });
    expect(r.fato).toBe('crescimento anual de −4,4% em 5 anos · 200 → 160 (R$ mi)');
  });

  it('início = fim (taxa 0) não atende', () => {
    expect(avaliar([100, 120, 80, 90, 95, 100], FIM_POSITIVO).estado).toBe('nao_atende');
  });

  it("início ≤ 0 com 'fim_positivo': atende pelo último ano, com o fato da base", () => {
    for (const inicio of [-50, 0]) {
      const r = avaliar([inicio, 10, 20, 30, 40, 50], FIM_POSITIVO);
      expect(r).toMatchObject({ estado: 'atende', n: 5, de: 5 });
      expect(r.motivo).toBeUndefined();
      expect(r.fato).toContain('taxa anual não se calcula com base negativa ou zero');
      expect(r.fato).toContain('(R$ mi)');
    }
  });

  it("início ≤ 0 com 'sem_dado' (e sem o bloco cagr): sem dado com o motivo base_nao_positiva", () => {
    for (const P of [SEM_DADO, SEM_BLOCO]) {
      const r = avaliar([-50, 10, 20, 30, 40, 50], P);
      expect(r).toMatchObject({
        estado: 'sem_dado',
        n: null,
        de: null,
        motivo: 'base_nao_positiva',
      });
      expect(r.serie).toHaveLength(6);
    }
  });

  it('fim ≤ 0 não atende em qualquer modo (inclusive com início ≤ 0)', () => {
    for (const P of [FIM_POSITIVO, SEM_DADO]) {
      for (const v of [
        [100, 90, 80, 70, 60, -10],
        [100, 90, 80, 70, 60, 0],
        [-100, -90, -80, -70, -60, -10],
      ]) {
        const r = avaliar(v, P);
        expect(r).toMatchObject({ estado: 'nao_atende', n: 0, de: 5 });
        expect(r.fato).toContain('último ano negativo ou zero');
      }
    }
  });

  it('ano faltante dentro da janela = sem dado (nunca atende por falta)', () => {
    const s = serie(2025, [100, 110, 120, 130, 140, 150]);
    delete (s as Record<number, number>)[2022];
    const r = avaliarCriterio(
      { def: REC, janela: 5, anoFim: 2025, classe: 'acao', serie: s },
      FIM_POSITIVO,
    );
    expect(r).toMatchObject({ estado: 'sem_dado', motivo: 'sem_dado_demonstracoes' });
    // o ano anterior à janela também é exigido
    const s2 = serie(2025, [100, 110, 120, 130, 140, 150]);
    delete (s2 as Record<number, number>)[2020];
    expect(
      avaliarCriterio(
        { def: REC, janela: 5, anoFim: 2025, classe: 'acao', serie: s2 },
        FIM_POSITIVO,
      ).estado,
    ).toBe('sem_dado');
  });

  it('J = 3, 5 e 10: a taxa usa os anos da janela', () => {
    const valores = [100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150];
    const s = serie(2025, valores);
    const em = (janela: Janela) =>
      avaliarCriterio({ def: REC, janela, anoFim: 2025, classe: 'acao', serie: s }, FIM_POSITIVO);
    expect(em(3).fato).toContain('em 3 anos · 135 → 150');
    expect(em(5).fato).toContain('em 5 anos · 125 → 150');
    expect(em(10).fato).toContain('em 10 anos · 100 → 150');
    expect(em(10).fato).toContain(
      `${(taxaCagr(100, 150, 10) * 100).toFixed(1).replace('.', ',')}%`,
    );
    for (const j of [3, 5, 10] as const) expect(em(j)).toMatchObject({ estado: 'atende', de: j });
  });

  it('sem unidade, o fato sem o parêntese', () => {
    const r = avaliar([100, 101, 102, 103, 104, 110], FIM_POSITIVO, 5, {
      ...REC,
      unidade: undefined,
    });
    expect(r.fato).toBe('crescimento anual de 1,9% em 5 anos · 100 → 110');
  });

  it("'ebitda' sobre a série 'ebit' não se aplica com o texto do lucro operacional", () => {
    const r = avaliarCriterio(
      {
        def: { ...REC, id: 'ebitda', serie: 'ebit' },
        janela: 5,
        anoFim: 2025,
        classe: 'acao',
        naoSeAplica: true,
      },
      FIM_POSITIVO,
    );
    expect(r.estado).toBe('nao_se_aplica');
    expect(r.fato).toContain('lucro operacional (EBIT)');
    // a série de antes (ebitda) mantém o texto de antes
    const antes = avaliarCriterio(
      {
        def: { ...REC, id: 'ebitda', serie: 'ebitda', tipo: 'up' },
        janela: 5,
        anoFim: 2025,
        classe: 'acao',
        naoSeAplica: true,
      },
      FIM_POSITIVO,
    );
    expect(antes.fato).toContain('não tem EBITDA nem dívida líquida');
  });
});

describe('margem da financeira com o override por perfil', () => {
  const NSA = paramsCom((j) => {
    (j.criterios as { margem: Record<string, unknown> }).margem.porPerfil = {
      acao_financeira: 'nao_se_aplica',
    };
  });
  const anos = [2021, 2022, 2023, 2024, 2025];
  const lucro = Object.fromEntries(anos.map((a) => [a, 1000]));
  const entrada = (margem: Record<number, number | null>, perfil: 'acao' | 'acao_financeira') => ({
    symbol: 'X',
    classe: 'acao' as const,
    perfil,
    anoFim: 2025,
    series: { net_income: lucro, net_margin: margem },
    meses: null,
  });

  it('um ano com lucro e sem margem (receita ≤ lucro) ⇒ mg não se aplica na financeira', () => {
    const margem = { ...Object.fromEntries(anos.map((a) => [a, 20])), 2023: null };
    const j = avaliarJanela(entrada(margem, 'acao_financeira'), 5, NSA);
    expect(j.resultados.find((r) => r.id === 'mg')?.estado).toBe('nao_se_aplica');
    expect(j.aplicaveis).toBe(5);
    // sem o override (v4): sem dado, como antes
    const v4 = avaliarJanela(entrada(margem, 'acao_financeira'), 5, SEM_BLOCO);
    expect(v4.resultados.find((r) => r.id === 'mg')?.estado).toBe('sem_dado');
    // ação não financeira: o override não vale
    const acao = avaliarJanela(entrada(margem, 'acao'), 5, NSA);
    expect(acao.resultados.find((r) => r.id === 'mg')?.estado).toBe('sem_dado');
  });

  it('margem em todos os anos ⇒ avaliada normalmente', () => {
    const margem = Object.fromEntries(anos.map((a) => [a, 20]));
    const j = avaliarJanela(entrada(margem, 'acao_financeira'), 5, NSA);
    expect(j.resultados.find((r) => r.id === 'mg')?.estado).toBe('atende');
  });
});
