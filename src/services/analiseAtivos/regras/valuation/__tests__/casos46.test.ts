/**
 * Os 23 casos de teste do Valuation (spec v1.3 §4.6), numerados como na spec.
 * Tolerância: 0,005 nos valores monetários APÓS arredondar a 2 casas; 0,5 nos percentuais inteiros.
 * Dados do protótipo: WEGE3 cotação 52,30 · HGLG11 158,20 · O 58,40.
 */
import { describe, expect, it } from 'vitest';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { arredondar } from '@/services/analiseAtivos/regras/valuation/arredondamento';
import { barraPosicao } from '@/services/analiseAtivos/regras/valuation/barraPosicao';
import {
  aplicarCenarioSalvo,
  restaurarPadrao,
} from '@/services/analiseAtivos/regras/valuation/cenario';
import { metaDeRenda } from '@/services/analiseAtivos/regras/valuation/metaRenda';
import {
  bazin,
  comMargem,
  gordon,
  graham,
  multiploAlvo,
  pvpAlvo,
  rendaDesejada,
  suaPosicao,
  vsCotacaoPct,
} from '@/services/analiseAtivos/regras/valuation/metodos';
import {
  EXCECOES_TEXTO_FIXO,
  TEXTOS_ANALISE,
  encontrarPalavrasProibidas,
  textoStatusBarra,
} from '@/services/analiseAtivos/textos';

const P = SCORING_PARAMS_V1;

function reais(v: number | null, esperado: number) {
  expect(v).not.toBeNull();
  expect(Math.abs(arredondar(v as number, 2) - esperado)).toBeLessThanOrEqual(0.005);
}

function pctInteiro(v: number | null, esperado: number) {
  expect(v).not.toBeNull();
  expect(Math.abs(arredondar(v as number, 0) - esperado)).toBeLessThanOrEqual(0.5);
}

describe('§4.6 — casos de teste do Valuation', () => {
  it('1 · Bazin (ação): DPA 0,84 · yield 6% ⇒ R$ 14,00', () => {
    reais(bazin(0.84, 6), 14.0);
  });

  it('2 · Graham: LPA 1,64 · VPA 5,59 ⇒ R$ 14,36 (√206,27)', () => {
    const g = graham(1.64, 5.59);
    reais(g, 14.36);
    expect(arredondar((g as number) ** 2, 2)).toBe(206.27);
  });

  it('3 · Múltiplo alvo: P/L 22,3 · LPA 1,64 ⇒ R$ 36,57', () => {
    reais(multiploAlvo(22.3, 1.64), 36.57);
  });

  it('4 · Gordon: DPA 0,84 · g 8% · k 13% ⇒ R$ 18,14', () => {
    reais(gordon(0.84, 8, 13), 18.14);
  });

  it('5 · Gordon inválido: k = g ⇒ —', () => {
    expect(gordon(0.84, 13, 13)).toBeNull();
  });

  it('6 · Yield zero ⇒ —', () => {
    expect(bazin(0.84, 0)).toBeNull();
  });

  it('7 · Graham com prejuízo (LPA −0,50) ⇒ —', () => {
    expect(graham(-0.5, 5.59)).toBeNull();
  });

  it('8 · vs. cotação e margem: 14,00 · cotação 52,30 · margem 20% ⇒ −73% · R$ 11,20', () => {
    pctInteiro(vsCotacaoPct(14, 52.3), -73);
    reais(comMargem(14, 20), 11.2);
  });

  it('9 · Renda desejada (FII): rendimento 12m 13,20 · yield 8% ⇒ R$ 165,00', () => {
    reais(rendaDesejada(13.2, 8), 165.0);
  });

  it('10 · P/VP alvo (FII): P/VP 1,00 · VP/cota 163,10 ⇒ R$ 163,10', () => {
    reais(pvpAlvo(1.0, 163.1), 163.1);
  });

  it('11 · Meta de renda: R$ 1.000/mês · rend. 13,20 · cotação 158,20 · 40 cotas ⇒ 910 · R$ 143.962,00 · faltam 870', () => {
    const m = metaDeRenda(1000, 13.2, 158.2, 40);
    expect(m).toEqual({ cotas: 910, custo: 143962.0, faltam: 870 });
  });

  it('12 · Sua posição (ação): PM 38,60 · LPA 1,64 · DPA 0,84 ⇒ P/L 23,5 · yield sobre custo 2,2%', () => {
    const s = suaPosicao({ pm: 38.6, lpa: 1.64, dpa: 0.84 });
    expect(arredondar(s.multiploSobreCusto as number, 1)).toBe(23.5);
    expect(arredondar(s.yieldSobreCustoPct as number, 1)).toBe(2.2);
  });

  it('13 · Sua posição (FII): PM 151,40 · VP/cota 163,10 · rend. 13,20 ⇒ P/VP 0,93 · 8,7%', () => {
    const s = suaPosicao({ pm: 151.4, vpCota: 163.1, rend12m: 13.2 });
    expect(arredondar(s.multiploSobreCusto as number, 2)).toBe(0.93);
    expect(arredondar(s.yieldSobreCustoPct as number, 1)).toBe(8.7);
  });

  it('14 · P/FFO alvo (REIT): 17,6 × 4,19 ⇒ US$ 73,74', () => {
    reais(multiploAlvo(17.6, 4.19), 73.74);
  });

  it('15 · Bazin (REIT): DPS 3,16 · yield 5,5% ⇒ US$ 57,45', () => {
    const b = bazin(3.16, 5.5) as number;
    expect(arredondar(b, 2)).toBe(57.45);
    reais(b, 57.45);
  });

  it('16 · Gordon (REIT): DPS 3,16 · g 3% · k 8% ⇒ US$ 65,10', () => {
    reais(gordon(3.16, 3, 8), 65.1);
  });

  it('17 · Barra múltiplo: P/L 31,2 ⇒ mín 13,4 · média 22,3 · máx 35,1 · "+40% vs. média 10a" (sem "maior")', () => {
    const h = [15.8, 19.4, 21.0, 27.4, 35.1, 21.9, 19.3, 13.4, 18.1, 31.2];
    const b = barraPosicao(31.2, h, 'multiplo', P, { excluirNaoPositivos: true });
    expect(b.visivel).toBe(true);
    expect(arredondar(b.min as number, 1)).toBe(13.4);
    expect(arredondar(b.media as number, 1)).toBe(22.3);
    expect(arredondar(b.max as number, 1)).toBe(35.1);
    expect(b.status).toEqual({ tipo: 'variacao_pct', valor: 40 });
    const texto = textoStatusBarra(b.status!, b.nPontos);
    expect(texto).toBe('+40% vs. média 10a');
    expect(texto).not.toMatch(/maior/);
  });

  it('18 · Barra percentual: ROE 29,4 ⇒ média 25,1 · "+4,3 p.p. vs. média 10a"', () => {
    const h = [18.2, 17.9, 18.7, 20.1, 24.7, 30.2, 29.8, 32.1, 30.3, 29.4];
    const b = barraPosicao(29.4, h, 'percentual', P);
    expect(arredondar(b.media as number, 1)).toBe(25.1);
    expect(b.status).toEqual({ tipo: 'variacao_pp', valor: 4.3 });
    expect(textoStatusBarra(b.status!, b.nPontos)).toBe('+4,3 p.p. vs. média 10a');
  });

  it('19 · Média perto de zero: DL/EBITDA −0,50, média −0,30 ⇒ "abaixo da média 10a" + "menor em 10 anos"', () => {
    // histórico completo do protótipo (regras-spec-resultados.json, caso 19)
    const h = [-0.3, -0.04, -0.4, -0.29, -0.23, -0.03, -0.37, -0.35, -0.48, -0.5];
    const b = barraPosicao(-0.5, h, 'multiplo', P);
    expect(arredondar(b.media as number, 1)).toBe(-0.3);
    expect(b.status).toEqual({ tipo: 'abaixo', extremo: 'menor' });
    const texto = textoStatusBarra(b.status!, b.nPontos);
    expect(texto).toContain('abaixo da média 10a');
    expect(texto).toContain('menor em 10 anos');
    expect(texto).not.toMatch(/%/);
  });

  it('20 · Na média: 22,5 contra média 22,3 (0,9%) ⇒ "na média de 10 anos"', () => {
    const h = [20.3, 24.3, 21.3, 23.3, 22.3, 22.3, 22.3, 22.3, 22.3, 22.3];
    const b = barraPosicao(22.5, h, 'multiplo', P, { excluirNaoPositivos: true });
    expect(arredondar(b.media as number, 1)).toBe(22.3);
    expect(b.status).toEqual({ tipo: 'na_media' });
    expect(textoStatusBarra(b.status!, b.nPontos)).toBe('na média de 10 anos');
  });

  it('21 · Histórico curto (4 pontos) ⇒ barra oculta', () => {
    const b = barraPosicao(20, [18.1, 19.2, 21.0, 22.5], 'multiplo', P);
    expect(b.visivel).toBe(false);
    expect(b.status).toBeNull();
    expect(b.nPontos).toBe(4);
  });

  it('22 · Salvar cenário (parte pura): yield salvo 4 vence o padrão 6; restaurar volta a 6 e apaga o registro', () => {
    const padrao = P.valuation.premissasPadrao.acao;
    expect(padrao.yieldPct).toBe(6);
    const aberto = aplicarCenarioSalvo(padrao, { ...padrao, yieldPct: 4 });
    expect(aberto.origem).toBe('salvo');
    expect(aberto.premissas.yieldPct).toBe(4);
    const restaurado = restaurarPadrao(padrao);
    expect(restaurado.premissas.yieldPct).toBe(6);
    expect(restaurado.apagarRegistro).toBe(true);
    expect(aplicarCenarioSalvo(padrao, null).origem).toBe('ativo');
  });

  it('23 · Linguagem: nenhuma palavra proibida nos textos do Valuation (exceto o rodapé fixo)', () => {
    const excecoes = new Set<string>(EXCECOES_TEXTO_FIXO);
    const textos = [
      ...Object.values(TEXTOS_ANALISE.valuation),
      ...Object.values(TEXTOS_ANALISE.barra),
      ...Object.entries(TEXTOS_ANALISE)
        .filter(([k, v]) => typeof v === 'string' && !excecoes.has(k))
        .map(([, v]) => v as string),
    ];
    for (const t of textos) expect(encontrarPalavrasProibidas(t)).toEqual([]);
    // o rodapé obrigatório cita "preço justo" para negá-lo: é exceção explícita, não falha
    expect(encontrarPalavrasProibidas(TEXTOS_ANALISE.rodapeValuation)).toContain('preço justo');
    expect(excecoes.has('rodapeValuation')).toBe(true);
  });
});
