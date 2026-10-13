/**
 * Spec v2.4 §4.5 — casos de teste dos Filtros de Fundamentos que são do MOTOR (fatia A): 24–29,
 * com as séries literais do protótipo (src/test/fixtures/analiseAtivos/criterios.ts → CASOS_45).
 *
 * Os outros casos da §4.5 ficam com as fatias donas (arquitetura.casos_teste do desenho):
 *  - 1–21 (Valuation, puros) e 22–23 (cenários em branco, linguagem): regras/valuation/__tests__/
 *    casos46.test.ts e montarCenarios.test.ts + useEstadoCenario.test (C2);
 *  - 30 (filtro combinado E + contador) e 31 (troca de classe, lista vazia): Quadro (B,
 *    quadro/__tests__/caso30.test.ts e QuadroAnalise.test.tsx) — o número real do DEV sai do
 *    scripts/analise-ativos/relatorio-criterios.ts ("análogo do caso 30");
 *  - 32 (linguagem e isonomia): por fatia com varrerDom (B, C1, C2, D) + global na F;
 *  - 33 (alvo na base da aba): Carteira (C1, caso33.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { criteriosDoPerfil } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { avaliarCriterio } from '@/services/analiseAtivos/regras/criterios/avaliarCriterio';
import { avaliarJanela } from '@/services/analiseAtivos/regras/criterios/avaliarAtivo';
import { CASOS_45 } from '@/test/fixtures/analiseAtivos/criterios';

const P = CRITERIA_PARAMS_V1;

function defDe(perfil: (typeof CASOS_45)[number]['perfil'], id: string) {
  const def = criteriosDoPerfil(P, perfil).find((d) => d.id === id);
  if (!def) throw new Error(`critério ${id} fora do perfil ${perfil}`);
  return def;
}

describe('§4.5 casos 24–29 (motor dos Filtros de Fundamentos)', () => {
  for (const c of CASOS_45) {
    it(`caso ${c.caso} — ${c.descricao} (janela ${c.janela})`, () => {
      const def = defDe(c.perfil, c.criterio);
      const r = avaliarCriterio(
        {
          def,
          janela: c.janela,
          anoFim: c.anoFim,
          classe: c.perfil.startsWith('fii') ? 'fii' : 'acao',
          serie: c.serie,
          meses: c.meses ?? null,
        },
        P,
      );
      expect(r.id).toBe(c.criterio);
      expect(r.estado).toBe(c.esperado.estado);
      expect(r.fato).toBe(c.esperado.fato);
      expect(r.n).toBe(c.esperado.n);
      expect(r.de).toBe(c.esperado.de);
    });
  }

  it('caso 24 — a série da janela tem J + 1 pontos (o ano anterior entra na comparação)', () => {
    const c = CASOS_45.find((x) => x.caso === 24)!;
    const r = avaliarCriterio(
      { def: defDe('acao', 'rec'), janela: 5, anoFim: 2025, classe: 'acao', serie: c.serie },
      P,
    );
    expect(r.serie?.map((p) => p.ano)).toEqual([2020, 2021, 2022, 2023, 2024, 2025]);
  });

  it('caso 26 — o mesmo critério dentro do motor do ativo: conta no "n de 6"', () => {
    const c = CASOS_45.find((x) => x.caso === 26)!;
    const j = avaliarJanela(
      {
        symbol: 'WEGE3',
        classe: 'acao',
        perfil: 'acao',
        anoFim: 2025,
        series: { dlEbitda: c.serie },
        meses: null,
      },
      5,
      P,
    );
    const dl = j.resultados.find((r) => r.id === 'dl')!;
    expect(dl.estado).toBe('atende');
    expect(j.aplicaveis).toBe(6);
    // os demais critérios sem série = sem dado (não atendem por falta de dado)
    expect(j.atendidos).toBe(1);
    expect(j.resultados.filter((r) => r.estado === 'sem_dado')).toHaveLength(5);
  });

  it('caso 29 — 7 anos de demonstrações atendem nas janelas 3 e 5, nunca na 10 por falta', () => {
    const c = CASOS_45.find((x) => x.caso === 29)!;
    const def = defDe('acao', 'rec');
    const em = (janela: 3 | 5 | 10) =>
      avaliarCriterio({ def, janela, anoFim: 2025, classe: 'acao', serie: c.serie }, P);
    expect(em(3).estado).toBe('atende');
    expect(em(5).estado).toBe('atende');
    expect(em(10).estado).toBe('sem_dado');
    expect(em(10).motivo).toBe('sem_dado_demonstracoes');
  });
});
