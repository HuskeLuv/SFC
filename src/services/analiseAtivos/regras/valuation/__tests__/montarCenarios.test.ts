/**
 * montarCenarios (Bloco D, fatia B): casos da §4.6 pelo módulo da tela + os números do DEV
 * (spec-desenho.json, metodos_cenarios) e os casos-limite (nunca lança; "—" com o motivo).
 */
import { describe, expect, it } from 'vitest';
import {
  montarCenarios,
  type EntradaMontarCenarios,
  type LinhaCenario,
} from '@/services/analiseAtivos/regras/valuation/montarCenarios';
import {
  aplicarCenarioSalvo,
  diffDadosEditados,
  lerNumeroDigitado,
  validarPremissa,
} from '@/services/analiseAtivos/regras/valuation/cenario';
import { TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';

const M = TEXTOS_CENARIOS.motivos;

function acao(over: Partial<EntradaMontarCenarios> = {}): EntradaMontarCenarios {
  return {
    classe: 'acao',
    base: {
      valores: { lpa: 1.490539764617915, vpa: 4.495275640109388, dpa: 2.003246712 },
      conferencias: { dpa: 'selo' },
    },
    premissas: { yieldPct: 6, plAlvo: 36.9, gPct: 8, kPct: 13 },
    dadosEditados: {},
    margemPct: 20,
    cotacao: 50.29,
    posicao: null,
    ...over,
  };
}

function fii(over: Partial<EntradaMontarCenarios> = {}): EntradaMontarCenarios {
  return {
    classe: 'fii',
    base: { valores: { rend12m: 13.34, vpCota: 165.95140819 }, conferencias: {} },
    premissas: { yieldPct: 8, pvpAlvo: 1, rendaMensal: 1000 },
    dadosEditados: {},
    margemPct: 10,
    cotacao: 147.93,
    posicao: null,
    ...over,
  };
}

function linha(linhas: LinhaCenario[], metodo: LinhaCenario['metodo']): LinhaCenario {
  const l = linhas.find((x) => x.metodo === metodo);
  if (!l) throw new Error(`sem ${metodo}`);
  return l;
}

describe('§4.6 pelo módulo da tela (casos 1–13)', () => {
  // Dados do protótipo da spec v1.3: WEGE3 cotação 52,30
  const base = (v: Record<string, number>) => ({ valores: v, conferencias: {} });

  it('1 · Bazin: DPA 0,84 · yield 6% ⇒ 14,00', () => {
    const s = montarCenarios(acao({ base: base({ lpa: 1.64, vpa: 5.59, dpa: 0.84 }) }));
    expect(linha(s.linhas, 'bazin').resultado).toBe(14);
  });

  it('2 · Graham: LPA 1,64 · VPA 5,59 ⇒ 14,36', () => {
    const s = montarCenarios(acao({ base: base({ lpa: 1.64, vpa: 5.59, dpa: 0.84 }) }));
    expect(linha(s.linhas, 'graham').resultado).toBe(14.36);
  });

  it('3 · Múltiplo alvo: P/L 22,3 · LPA 1,64 ⇒ 36,57', () => {
    const s = montarCenarios(
      acao({
        base: base({ lpa: 1.64, vpa: 5.59, dpa: 0.84 }),
        premissas: { yieldPct: 6, plAlvo: 22.3, gPct: 8, kPct: 13 },
      }),
    );
    expect(linha(s.linhas, 'multiplo').resultado).toBe(36.57);
  });

  it('4 · Gordon: DPA 0,84 · g 8 · k 13 ⇒ 18,14', () => {
    const s = montarCenarios(acao({ base: base({ lpa: 1.64, vpa: 5.59, dpa: 0.84 }) }));
    expect(linha(s.linhas, 'gordon').resultado).toBe(18.14);
  });

  it('5 · k = g ⇒ — com o motivo', () => {
    const s = montarCenarios(
      acao({ premissas: { yieldPct: 6, plAlvo: 36.9, gPct: 13, kPct: 13 } }),
    );
    const g = linha(s.linhas, 'gordon');
    expect(g.resultado).toBeNull();
    expect(g.motivoSemResultado).toBe(M.kMenorOuIgualG);
  });

  it('6 · yield 0 ⇒ — (fora do limite)', () => {
    const s = montarCenarios(acao({ premissas: { yieldPct: 0, plAlvo: 36.9, gPct: 8, kPct: 13 } }));
    const b = linha(s.linhas, 'bazin');
    expect(b.resultado).toBeNull();
    expect(b.motivoSemResultado).toBe('yield fora do limite');
  });

  it('7 · Graham com LPA −0,50 ⇒ —', () => {
    const s = montarCenarios(acao({ base: base({ lpa: -0.5, vpa: 5.59, dpa: 0.84 }) }));
    expect(linha(s.linhas, 'graham').motivoSemResultado).toBe(M.lpaNaoPositivo);
  });

  it('8 · vs. cotação e margem: 14,00 · cotação 52,30 · 20% ⇒ −73% · 11,20', () => {
    const s = montarCenarios(
      acao({ base: base({ lpa: 1.64, vpa: 5.59, dpa: 0.84 }), cotacao: 52.3 }),
    );
    const b = linha(s.linhas, 'bazin');
    expect(b.vsCotacaoPct).toBe(-73);
    expect(b.comMargem).toBe(11.2);
  });

  it('9 · Renda desejada: 13,20 · 8% ⇒ 165,00', () => {
    const s = montarCenarios(fii({ base: base({ rend12m: 13.2, vpCota: 163.1 }) }));
    expect(linha(s.linhas, 'rendaDesejada').resultado).toBe(165);
  });

  it('10 · P/VP alvo 1,00 × 163,10 ⇒ 163,10', () => {
    const s = montarCenarios(fii({ base: base({ rend12m: 13.2, vpCota: 163.1 }) }));
    expect(linha(s.linhas, 'pvpAlvo').resultado).toBe(163.1);
  });

  it('11 · Meta: R$ 1.000 · 13,20 · 158,20 · 40 cotas ⇒ 910 · 143.962,00 · faltam 870', () => {
    const s = montarCenarios(
      fii({
        base: base({ rend12m: 13.2, vpCota: 163.1 }),
        cotacao: 158.2,
        posicao: { pm: 151.4, quantidade: 40 },
      }),
    );
    expect(s.metaRenda).toMatchObject({ cotas: 910, custo: 143962, faltam: 870 });
  });

  it('12 · Sua posição (ação): PM 38,60 · LPA 1,64 · DPA 0,84 ⇒ 23,5 · 2,2%', () => {
    const s = montarCenarios(
      acao({
        base: base({ lpa: 1.64, vpa: 5.59, dpa: 0.84 }),
        posicao: { pm: 38.6, quantidade: 300 },
      }),
    );
    expect(s.suaPosicao).toMatchObject({ multiploSobreCusto: 23.5, yieldSobreCustoPct: 2.2 });
  });

  it('13 · Sua posição (FII): PM 151,40 · VP 163,10 · rend 13,20 ⇒ 0,93 · 8,7%', () => {
    const s = montarCenarios(
      fii({
        base: base({ rend12m: 13.2, vpCota: 163.1 }),
        posicao: { pm: 151.4, quantidade: 40 },
      }),
    );
    expect(s.suaPosicao).toMatchObject({ multiploSobreCusto: 0.93, yieldSobreCustoPct: 8.7 });
  });
});

describe('WEGE3 do DEV (cotação 50,29 · LPA 1,49 · VPA 4,50 · DPA 2,00 com selo · P/L 36,9)', () => {
  const s = montarCenarios(acao({ posicao: { pm: 38.6, quantidade: 300 } }));

  it('Bazin 6% = 33,33 (−34%; com 20% = 26,67) e usa DPA em conferência', () => {
    const b = linha(s.linhas, 'bazin');
    expect(b).toMatchObject({ resultado: 33.33, vsCotacaoPct: -34, comMargem: 26.67 });
    expect(b.usaDadoEmConferencia).toBe('usa DPA em conferência');
  });

  it('Graham 12,28 · Múltiplo 54,98 · Gordon 43,20 (−14%; 34,56)', () => {
    expect(linha(s.linhas, 'graham').resultado).toBe(12.28);
    expect(linha(s.linhas, 'graham').usaDadoEmConferencia).toBeNull();
    expect(linha(s.linhas, 'multiplo').resultado).toBe(54.98);
    expect(linha(s.linhas, 'gordon')).toMatchObject({
      resultado: 43.2,
      vsCotacaoPct: -14,
      comMargem: 34.56,
      usaDadoEmConferencia: 'usa DPA em conferência',
    });
  });

  it('Sua posição com PM 38,60: P/L sobre custo 25,9× e yield sobre custo 5,2%', () => {
    expect(s.suaPosicao).toMatchObject({
      quantidade: 300,
      pm: 38.6,
      multiploSobreCusto: 25.9,
      yieldSobreCustoPct: 5.2,
      proventoEmConferencia: true,
    });
  });

  it('digitar outro DPA tira o "usa DPA em conferência"', () => {
    const e = montarCenarios(acao({ dadosEditados: { dpa: 1.5 } }));
    expect(linha(e.linhas, 'bazin')).toMatchObject({ resultado: 25, usaDadoEmConferencia: null });
  });

  it('barras: mesma escala (maior valor × 1,08), cotação e ordem fixa', () => {
    expect(s.barras.itens.map((i) => i.metodo)).toEqual(['bazin', 'graham', 'multiplo', 'gordon']);
    expect(s.barras.escalaMax).toBeCloseTo(54.98 * 1.08, 6);
    expect(s.barras.cotacao).toBe(50.29);
    expect(s.nenhumResultado).toBe(false);
  });
});

describe('cotação em conferência (SBSP3: base da cotação em conferência)', () => {
  it("'ocultar' (preco_base): vs. cotação '—' com o motivo e barras sem a cotação", () => {
    const s = montarCenarios(acao({ cotacaoConferencia: 'ocultar' }));
    for (const l of s.linhas) {
      expect(l.vsCotacaoPct).toBeNull();
      if (l.resultado !== null) expect(l.usaDadoEmConferencia).toContain(M.vsCotacaoConferencia);
    }
    expect(linha(s.linhas, 'bazin').usaDadoEmConferencia).toBe(
      `usa DPA em conferência · ${M.vsCotacaoConferencia}`,
    );
    expect(linha(s.linhas, 'bazin').resultado).not.toBeNull();
    expect(s.barras.cotacao).toBeNull();
    const maior = Math.max(...s.linhas.map((l) => l.resultado ?? 0));
    expect(s.barras.escalaMax).toBeCloseTo(maior * 1.08, 6);
  });

  it("'selo' (preco_esporadico): vs. cotação fica e o método diz 'usa cotação em conferência'", () => {
    const s = montarCenarios(acao({ cotacaoConferencia: 'selo' }));
    const g = linha(s.linhas, 'graham');
    expect(g.vsCotacaoPct).not.toBeNull();
    expect(g.usaDadoEmConferencia).toBe('usa cotação em conferência');
    expect(s.barras.cotacao).toBe(50.29);
  });
});

describe('casos-limite: "—" com motivo, nunca exceção', () => {
  it('AURE3: LPA −1,04, DPA 0, P/L alvo vazio ⇒ os 4 "—" e nenhum resultado', () => {
    const s = montarCenarios(
      acao({
        base: {
          valores: { lpa: -1.042874305379391, vpa: 11.0156494852269, dpa: 0 },
          conferencias: {},
        },
        premissas: { yieldPct: 6, plAlvo: null, gPct: 8, kPct: 13 },
        cotacao: 12.69,
      }),
    );
    expect(s.linhas.map((l) => l.resultado)).toEqual([null, null, null, null]);
    expect(linha(s.linhas, 'bazin').motivoSemResultado).toBe(M.dpaZero);
    expect(linha(s.linhas, 'graham').motivoSemResultado).toBe(M.lpaNaoPositivo);
    expect(linha(s.linhas, 'multiplo').motivoSemResultado).toBe(M.lpaNaoPositivo);
    expect(linha(s.linhas, 'gordon').motivoSemResultado).toBe(M.dpaZero);
    expect(s.nenhumResultado).toBe(true);
    expect(s.barras.escalaMax).toBe(0);
  });

  it('P/L alvo vazio com LPA positivo ⇒ "informe o P/L alvo"', () => {
    const s = montarCenarios(acao({ premissas: { yieldPct: 6, plAlvo: null, gPct: 8, kPct: 13 } }));
    expect(linha(s.linhas, 'multiplo').motivoSemResultado).toBe(M.plVazio);
  });

  it('VPA ≤ 0 ⇒ Graham "—"', () => {
    const s = montarCenarios(acao({ dadosEditados: { vpa: -2 } }));
    expect(linha(s.linhas, 'graham').motivoSemResultado).toBe(M.vpaNaoPositivo);
  });

  it('k < g ⇒ Gordon "—"; yield 45 ⇒ Bazin "—" fora do limite', () => {
    const s = montarCenarios(
      acao({ premissas: { yieldPct: 45, plAlvo: 36.9, gPct: 15, kPct: 10 } }),
    );
    expect(linha(s.linhas, 'gordon').motivoSemResultado).toBe(M.kMenorOuIgualG);
    expect(linha(s.linhas, 'bazin').motivoSemResultado).toBe('yield fora do limite');
  });

  it('texto que não é número (NaN) e campo vazio nunca lançam', () => {
    const s = montarCenarios(
      acao({ premissas: { yieldPct: Number.NaN, plAlvo: 36.9, gPct: null, kPct: 13 } }),
    );
    expect(linha(s.linhas, 'bazin').motivoSemResultado).toBe('yield fora do limite');
    expect(linha(s.linhas, 'gordon').motivoSemResultado).toBe('falta g');
    const d = montarCenarios(acao({ dadosEditados: { lpa: Number.NaN, dpa: null } }));
    expect(linha(d.linhas, 'graham').motivoSemResultado).toBe('falta LPA');
    expect(linha(d.linhas, 'bazin').motivoSemResultado).toBe('falta DPA');
  });

  it('CBAV3 com "ocultar": LPA/VPA vazios + motivo de conferência; digitar libera a conta', () => {
    const e = acao({
      base: {
        valores: { lpa: null, vpa: null, dpa: 0.09 },
        conferencias: { lpa: 'ocultar', vpa: 'ocultar' },
      },
      cotacao: 11.22,
    });
    const s = montarCenarios(e);
    expect(linha(s.linhas, 'graham').motivoSemResultado).toMatch(/^LPA em conferência/);
    expect(s.efetivos).toMatchObject({ lpa: null, vpa: null });
    const d = montarCenarios({ ...e, dadosEditados: { lpa: 1, vpa: 10 } });
    expect(linha(d.linhas, 'graham').resultado).toBe(15);
  });

  it('sem cotação: vs. cotação "—" e barras sem a linha', () => {
    const s = montarCenarios(acao({ cotacao: null }));
    expect(linha(s.linhas, 'bazin')).toMatchObject({ resultado: 33.33, vsCotacaoPct: null });
    expect(s.barras.cotacao).toBeNull();
  });

  it('VP oculto do FII ⇒ "VP/cota em conferência"', () => {
    const s = montarCenarios(
      fii({
        base: { valores: { rend12m: 13.34, vpCota: null }, conferencias: { vpCota: 'ocultar' } },
      }),
    );
    expect(linha(s.linhas, 'pvpAlvo').motivoSemResultado).toBe(M.vpConferencia);
  });
});

describe('FIIs', () => {
  it('HGLG11: renda desejada 166,75 (+13%); P/VP alvo 165,95 (+12%); meta 900 cotas · 133.137,00', () => {
    const s = montarCenarios(fii());
    expect(linha(s.linhas, 'rendaDesejada')).toMatchObject({ resultado: 166.75, vsCotacaoPct: 13 });
    expect(linha(s.linhas, 'pvpAlvo')).toMatchObject({ resultado: 165.95, vsCotacaoPct: 12 });
    expect(s.metaRenda).toMatchObject({ cotas: 900, custo: 133137, faltam: 900, target: 133137 });
    expect(s.metaRenda?.available).toBe(0);
  });

  it('MXRF11: rendimento com 3 casas (1,195) ⇒ 10.042 cotas · 91.382,20 · faltam 8.792', () => {
    const s = montarCenarios(
      fii({
        base: { valores: { rend12m: 1.195, vpCota: 9.260171 }, conferencias: {} },
        cotacao: 9.1,
        posicao: { pm: 9.64, quantidade: 1250 },
      }),
    );
    expect(s.metaRenda).toMatchObject({
      cotas: 10042,
      custo: 91382.2,
      faltam: 8792,
      target: 91382.2,
      available: 11375,
    });
  });

  it('rendimento usa o valor VISÍVEL (3 casas), não o bruto', () => {
    const s = montarCenarios(
      fii({
        base: { valores: { rend12m: 1.19549, vpCota: 9.26 }, conferencias: {} },
        cotacao: 9.1,
      }),
    );
    expect(s.metaRenda?.cotas).toBe(10042);
  });

  it('posição ≥ cotas ⇒ faltam 0, target > 0 e available = cotas × cotação', () => {
    const s = montarCenarios(
      fii({
        base: { valores: { rend12m: 1.195, vpCota: 9.26 }, conferencias: {} },
        cotacao: 9.1,
        premissas: { yieldPct: 8, pvpAlvo: 1, rendaMensal: 100 },
        posicao: { pm: 9.64, quantidade: 1250 },
      }),
    );
    expect(s.metaRenda).toMatchObject({ cotas: 1005, faltam: 0 });
    expect(s.metaRenda?.target).toBeGreaterThan(0);
    expect(s.metaRenda?.available).toBe(s.metaRenda?.target);
  });

  it('sem rendimento ⇒ sem meta', () => {
    const s = montarCenarios(
      fii({ base: { valores: { rend12m: 0, vpCota: 9.26 }, conferencias: {} } }),
    );
    expect(s.metaRenda).toBeNull();
    expect(linha(s.linhas, 'rendaDesejada').motivoSemResultado).toBe(M.rendimentoNaoPositivo);
  });
});

describe('helpers do cenario.ts (fatia B)', () => {
  it('diffDadosEditados: só o que difere do valor visível do ativo', () => {
    const base = { lpa: 1.490539, vpa: 4.495, dpa: 2.0032 };
    expect(diffDadosEditados(base, { lpa: 1.49, vpa: 4.5, dpa: 1.8 })).toEqual({ dpa: 1.8 });
    expect(diffDadosEditados(base, { lpa: 1.44, vpa: null, dpa: Number.NaN })).toEqual({
      lpa: 1.44,
    });
    expect(diffDadosEditados({ rend12m: 1.195 }, { rend12m: 1.1954 }, { rend12m: 3 })).toEqual({});
    expect(diffDadosEditados({ lpa: null }, { lpa: 2 })).toEqual({ lpa: 2 });
  });

  it('lerNumeroDigitado: vírgula, ponto, milhar e inválido', () => {
    expect(lerNumeroDigitado('6,5')).toBe(6.5);
    expect(lerNumeroDigitado('6.5')).toBe(6.5);
    expect(lerNumeroDigitado('1.195')).toBe(1.195);
    expect(lerNumeroDigitado('1.000', { milhar: true })).toBe(1000);
    expect(lerNumeroDigitado('1.000,50')).toBe(1000.5);
    expect(lerNumeroDigitado('−1,04')).toBe(-1.04);
    expect(lerNumeroDigitado('  ')).toBeNull();
    expect(lerNumeroDigitado('abc')).toBeNaN();
  });

  it('validarPremissa cobre P/L alvo, P/VP alvo e renda', () => {
    expect(validarPremissa('plAlvo', '36,9')).toBe(36.9);
    expect(validarPremissa('plAlvo', 250)).toBeNull();
    expect(validarPremissa('pvpAlvo', 6)).toBeNull();
    expect(validarPremissa('rendaMensal', 0.5)).toBeNull();
    expect(validarPremissa('rendaMensal', 1000)).toBe(1000);
  });

  it('aplicarCenarioSalvo: P/L alvo vazio salvo vale (anulável)', () => {
    const padrao = { yieldPct: 6, gPct: 8, kPct: 13, margemPct: 20, plAlvo: 36.9 as number | null };
    const r = aplicarCenarioSalvo(padrao, { yieldPct: 4, plAlvo: null }, ['plAlvo']);
    expect(r.premissas).toMatchObject({ yieldPct: 4, plAlvo: null });
    expect(aplicarCenarioSalvo(padrao, { plAlvo: null }).premissas.plAlvo).toBe(36.9);
  });
});
