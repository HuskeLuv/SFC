/**
 * Os 23 casos de teste do Valuation (spec v2.4 §4.5; eram §4.6 na v1.3), numerados como na spec.
 * Tolerância: 0,005 nos valores monetários APÓS arredondar a 2 casas; 0,5 nos percentuais inteiros.
 * Dados do protótipo: WEGE3 cotação 52,30 · HGLG11 158,20 · O 58,40.
 *
 * v2.4 (fatia C2): o 11 passa a "diferença para a meta configurada por você"; o 22 é reescrito
 * (premissas em branco, salvar, limpar); o 23 usa linguagemV2 ignorando só os literais registrados.
 */
import { describe, expect, it } from 'vitest';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { arredondar } from '@/services/analiseAtivos/regras/valuation/arredondamento';
import { barraPosicao } from '@/services/analiseAtivos/regras/valuation/barraPosicao';
import {
  aplicarCenarioSalvo,
  limparPremissas,
  premissasIniciaisAcao,
} from '@/services/analiseAtivos/regras/valuation/cenario';
import { montarCenarios } from '@/services/analiseAtivos/regras/valuation/montarCenarios';
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
  formatarTexto,
  textoStatusBarra,
} from '@/services/analiseAtivos/textos';
import { RODAPE_CENARIOS, TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import { RODAPE_CENARIOS_V2, ehTextoLiteral } from '@/services/analiseAtivos/textosLiterais';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import { folhasTexto } from '@/services/analiseAtivos/regras/comum/varreduraTextos';
import type { PremissasAcaoV2 } from '@/types/analiseAtivosCriterios';

const P = SCORING_PARAMS_V1;

function reais(v: number | null, esperado: number) {
  expect(v).not.toBeNull();
  expect(Math.abs(arredondar(v as number, 2) - esperado)).toBeLessThanOrEqual(0.005);
}

function pctInteiro(v: number | null, esperado: number) {
  expect(v).not.toBeNull();
  expect(Math.abs(arredondar(v as number, 0) - esperado)).toBeLessThanOrEqual(0.5);
}

describe('§4.5 — casos de teste do Valuation', () => {
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

  it('11 · Meta de renda: R$ 1.000/mês · rend. 13,20 · cotação 158,20 · 40 cotas ⇒ 910 · R$ 143.962,00 · diferença para a meta 870', () => {
    const m = metaDeRenda(1000, 13.2, 158.2, 40);
    expect(m).toEqual({ cotas: 910, custo: 143962.0, diferenca: 870 });
    const texto = formatarTexto(TEXTOS_CENARIOS.metaRenda.diferencaTexto, {
      n: 40,
      cotas: m!.diferenca,
      valor: `R$ ${(m!.diferenca * 158.2).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`,
    });
    expect(texto).toBe(
      'Posição atual vs. meta: 40 cotas · diferença para a meta configurada por você: 870 cotas (R$ 137.634)',
    );
    expect(texto).not.toMatch(/faltam?/i);
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

  describe('22 · Premissas em branco (spec §4.4): abrir, salvar, reabrir e limpar', () => {
    // WEGE3 do protótipo: DPA 0,84 · LPA 1,64 · VPA 5,59 · P/L médio 10a 22,3 · cotação 52,30
    const conta = (p: PremissasAcaoV2) =>
      montarCenarios({
        classe: 'acao',
        base: { valores: { lpa: 1.64, vpa: 5.59, dpa: 0.84 }, conferencias: {} },
        premissas: { yieldPct: p.yieldPct, gPct: p.gPct, kPct: p.kPct, plAlvo: p.plAlvo },
        dadosEditados: {},
        margemPct: p.margemPct,
        cotacao: 52.3,
        posicao: null,
      });
    const linha = (p: PremissasAcaoV2, m: string) => conta(p).linhas.find((l) => l.metodo === m)!;

    it('sem salvo: yield, g e k em branco; P/L alvo = média 10a (fato); margem 0', () => {
      const iniciais = premissasIniciaisAcao(22.3);
      expect(iniciais).toEqual({
        yieldPct: null,
        gPct: null,
        kPct: null,
        margemPct: 0,
        plAlvo: 22.3,
      });
      expect(aplicarCenarioSalvo(iniciais, null)).toEqual({ premissas: iniciais, origem: 'ativo' });
      // Bazin e Gordon pedem as premissas; Graham e Múltiplo calculam só com fatos
      expect(linha(iniciais, 'bazin')).toMatchObject({
        resultado: null,
        motivoSemResultado: 'informe yield',
      });
      expect(linha(iniciais, 'gordon')).toMatchObject({
        resultado: null,
        motivoSemResultado: 'informe g e k',
      });
      reais(linha(iniciais, 'graham').resultado, 14.36);
      reais(linha(iniciais, 'multiplo').resultado, 36.57);
      // margem 0: "com sua margem" = o próprio resultado
      expect(linha(iniciais, 'graham').comMargem).toBe(linha(iniciais, 'graham').resultado);
    });

    it('salvar yield 4 e reabrir: Bazin R$ 21,00 (os campos em branco continuam em branco)', () => {
      const iniciais = premissasIniciaisAcao(22.3);
      const salvo: PremissasAcaoV2 = { ...iniciais, yieldPct: 4 };
      const aberto = aplicarCenarioSalvo(iniciais, salvo);
      expect(aberto.origem).toBe('salvo');
      expect(aberto.premissas).toEqual({ ...iniciais, yieldPct: 4 });
      reais(linha(aberto.premissas, 'bazin').resultado, 21.0);
      expect(linha(aberto.premissas, 'gordon').motivoSemResultado).toBe('informe g e k');
      // P/L alvo apagado pelo usuário e salvo em branco continua em branco
      expect(aplicarCenarioSalvo(iniciais, { ...salvo, plAlvo: null }).premissas.plAlvo).toBeNull();
    });

    it('"Limpar minhas premissas": volta ao branco e apaga o registro (DELETE)', () => {
      const iniciais = premissasIniciaisAcao(22.3);
      const limpo = limparPremissas(iniciais);
      expect(limpo.apagarRegistro).toBe(true);
      expect(limpo.premissas).toEqual(iniciais);
      expect(limpo.premissas.yieldPct).toBeNull();
      expect(TEXTOS_CENARIOS.salvamento.restaurar).toBe('Limpar minhas premissas');
    });
  });

  it('23 · Linguagem (linguagemV2): nenhuma palavra proibida nos textos do Valuation e dos cenários; só o literal registrado passa', () => {
    const excecoes = new Set<string>(EXCECOES_TEXTO_FIXO);
    const textos = [
      ...Object.values(TEXTOS_ANALISE.valuation),
      ...Object.values(TEXTOS_ANALISE.barra),
      ...Object.entries(TEXTOS_ANALISE)
        .filter(([k, v]) => typeof v === 'string' && !excecoes.has(k))
        .map(([, v]) => v as string),
      ...folhasTexto(TEXTOS_CENARIOS).map(([, v]) => v),
    ];
    const achados = textos
      .map((t) => [t, encontrarProibidasV2(t, { ignorarLiterais: true })] as const)
      .filter(([, p]) => p.length > 0);
    expect(achados).toEqual([]);
    // o rodapé cita "preço justo" e "recomendação" para negá-los: passa SÓ por ser o literal
    // registrado ('rodape-cenarios'), com casamento exato da string inteira
    expect(RODAPE_CENARIOS).toBe(RODAPE_CENARIOS_V2.texto);
    expect(ehTextoLiteral(RODAPE_CENARIOS)).toBe(true);
    expect(encontrarProibidasV2(RODAPE_CENARIOS, { ignorarLiterais: true })).toEqual([]);
    expect(encontrarProibidasV2(RODAPE_CENARIOS)).toContain('preço justo');
    expect(
      encontrarProibidasV2(`${RODAPE_CENARIOS} Veja o preço justo.`, { ignorarLiterais: true }),
    ).toContain('preço justo');
  });
});
