import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  assetMultiplesCurrent: { findMany: vi.fn() },
  assetMultiplesYearly: { findMany: vi.fn() },
  assetPerShareYearly: { findMany: vi.fn() },
  fiiMonthly: { findMany: vi.fn() },
}));
const mockLeitor = vi.hoisted(() => ({
  obterLinhaQuadro: vi.fn(),
  obterLinhasQuadroApi: vi.fn(),
  versaoQuadro: vi.fn(),
}));
const mockAcoes = vi.hoisted(() => ({ fundamentosVigentes: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', async (orig) => {
  const real = await orig<typeof import('@/services/analiseAtivos/leitura/linhasQuadro')>();
  return { ...real, ...mockLeitor };
});
vi.mock('@/services/analiseAtivos/repositorio/acoes', () => mockAcoes);

import {
  linhaParEnxuta,
  montarBarra,
  montarValuation,
  obterValuation,
  type AnualValuation,
  type AtualValuation,
  type DadosAtivoValuation,
  type PerShareValuation,
} from '../valuationMultiplos';
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { encontrarPalavrasProibidas } from '@/services/analiseAtivos/textos';
import { linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
import type { AnaliseQuadroLinha } from '@prisma/client';
import type { Estado, ItemValuation, ValuationResposta } from '@/types/analiseAtivosApi';

const HOJE = '2026-10-02';
const TV = TEXTOS_TELA.analise.valuation;
const ok = (valor: number): Estado<number> => ({ estado: 'ok', valor });
const SEM_CONF = { conf: false, suspeitos: new Set<number>() };
const anos10 = (valores: number[]) =>
  valores.map((valor, i) => ({ ano: 2016 + i, valor }) as { ano: number; valor: number | null });

// ---------------------------------------------------------------------------
// Casos 17–21 da §4.6 (barra de posição)
// ---------------------------------------------------------------------------

describe('barra de posição — casos 17 a 21 da spec §4.6', () => {
  it('17: múltiplo — P/L 31,2 contra média 22,3 = "+40% vs. média 10a", sem extremo', () => {
    const b = montarBarra(
      ok(31.2),
      anos10([15.8, 19.4, 21.0, 27.4, 35.1, 21.9, 19.3, 13.4, 18.1, 31.2]),
      { tipoBarra: 'multiplo', excluirNaoPositivos: true },
      SEM_CONF,
    );
    expect(b.visivel).toBe(true);
    expect(b.min).toBe(13.4);
    expect(b.max).toBe(35.1);
    expect(b.media).toBeCloseTo(22.26, 2);
    expect(b.statusTexto).toBe('+40% vs. média 10a');
    expect(b.extremo).toBeNull();
    expect(b.nPontos).toBe(10);
  });

  it('18: percentual — ROE 29,4 contra média 25,1 = "+4,3 p.p. vs. média 10a"', () => {
    const b = montarBarra(
      ok(29.4),
      anos10([18.2, 17.9, 18.7, 20.1, 24.7, 30.2, 29.8, 32.1, 30.3, 29.4]),
      { tipoBarra: 'percentual' },
      SEM_CONF,
    );
    expect(b.media).toBeCloseTo(25.14, 2);
    expect(b.statusTexto).toBe('+4,3 p.p. vs. média 10a');
  });

  it('19: média perto de zero — dív.líq/EBITDA −0,50 contra −0,30 = "abaixo" sem % + "menor em 10 anos"', () => {
    const b = montarBarra(
      ok(-0.5),
      anos10([-0.3, -0.2, -0.4, -0.1, -0.45, -0.3, -0.25, -0.35, -0.3, -0.35]),
      { tipoBarra: 'multiplo' },
      SEM_CONF,
    );
    expect(b.media).toBeCloseTo(-0.3, 5);
    expect(b.statusTexto).toBe('abaixo da média 10a · menor em 10 anos');
    expect(b.statusTexto).not.toMatch(/%/);
    expect(b.extremo).toBe('menor');
  });

  it('20: na média — 22,5 contra 22,3 (0,9%) = "na média de 10 anos"', () => {
    const b = montarBarra(
      ok(22.5),
      anos10([21.3, 23.3, 21.3, 23.3, 21.3, 23.3, 21.3, 23.3, 21.3, 23.3]),
      { tipoBarra: 'multiplo', excluirNaoPositivos: true },
      SEM_CONF,
    );
    expect(b.statusTexto).toBe('na média de 10 anos');
  });

  it('21: histórico curto — 4 anos = barra oculta, só o valor e a referência', () => {
    const b = montarBarra(
      ok(1.15),
      [
        { ano: 2022, valor: 0.97 },
        { ano: 2023, valor: 1.08 },
        { ano: 2024, valor: 0.69 },
        { ano: 2025, valor: 0.99 },
      ],
      { tipoBarra: 'multiplo', excluirNaoPositivos: true },
      SEM_CONF,
    );
    expect(b).toEqual({
      visivel: false,
      min: null,
      media: null,
      max: null,
      nPontos: 4,
      statusTexto: TEXTOS_TELA.ativo.barraOculta,
      extremo: null,
    });
  });

  it('proventos em conferência: barra oculta com o motivo; anos suspeitos fora dos pontos', () => {
    const hist = anos10([1, 1, 1, 1, 1, 1, 1, 1, 1, 6.6]);
    const conf = montarBarra(
      ok(3.98),
      hist,
      { tipoBarra: 'percentual', proventos: true },
      { conf: true, suspeitos: new Set([2025]) },
    );
    expect(conf.visivel).toBe(false);
    expect(conf.statusTexto).toBe(TV.barraConferencia);
    expect(conf.nPontos).toBe(9);
    const semConf = montarBarra(
      ok(1),
      hist,
      { tipoBarra: 'percentual', proventos: true },
      { conf: false, suspeitos: new Set([2025]) },
    );
    expect(semConf.max).toBe(1);
  });

  it('valor ausente ou não comparável não mostra barra', () => {
    const hist = anos10([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(
      montarBarra(
        { estado: 'ausente', motivo: 'prejuizo', texto: 'x' },
        hist,
        { tipoBarra: 'multiplo' },
        SEM_CONF,
      ).visivel,
    ).toBe(false);
    const negativo = montarBarra(
      ok(-3),
      hist,
      { tipoBarra: 'multiplo', excluirNaoPositivos: true },
      SEM_CONF,
    );
    expect(negativo.visivel).toBe(false);
    expect(negativo.statusTexto).toBe(TV.barraForaComparacao);
  });
});

// ---------------------------------------------------------------------------
// Montagem completa
// ---------------------------------------------------------------------------

const ANOS = Array.from({ length: 12 }, (_, i) => 2014 + i); // 2014–2025

function atual(over: Partial<AtualValuation> = {}): AtualValuation {
  return {
    lpaTtm: 1.49,
    vpa: 4.5,
    dpa12m: 2.0,
    rend12m: null,
    vpCota: null,
    pl: 33.7,
    pvp: 11.19,
    pReceita: 5.26,
    evEbitda: 23.3,
    pFco: 30.4,
    pFcl: 52.1,
    dy12mPct: 3.98,
    payoutPct: 134.4,
    margemLiquidaPct: 16.63,
    roePct: 33.16,
    roaPct: 14.3,
    roicPct: 31.4,
    divLiqEbitda: -0.42,
    divLiqPl: -0.2,
    liquidezCorrente: 1.59,
    obrigacoesPlPct: null,
    naoSeAplica: [],
    ...over,
  };
}

function anual(ano: number, i: number, over: Partial<AnualValuation> = {}): AnualValuation {
  return {
    anoFiscal: ano,
    pl: 20 + i * 2,
    pvp: 4 + i,
    pReceita: 3 + i / 4,
    evEbitda: 18 + i,
    pFco: 25 + i,
    pFcl: 30 + i,
    dyPct: ano === 2025 ? 5.05 : 1.5,
    payoutPct: ano === 2025 ? 161 : 50,
    margemLiquidaPct: 12 + i / 2,
    roePct: 18 + i,
    roaPct: 9 + i / 2,
    roicPct: 15 + i,
    divLiqEbitda: -0.3,
    divLiqPl: -0.1,
    liquidezCorrente: 2,
    vpCota: null,
    rendCota12m: null,
    obrigacoesPlPct: null,
    vacanciaFisicaCvmPct: null,
    ...over,
  };
}

const DPA = [0.14, 0.15, 0.14, 0.14, 0.16, 0.17, 0.22, 0.44, 0.52, 0.61, 0.76, 2.45];
function perShare(i: number, ano: number): PerShareValuation {
  return {
    anoFiscal: ano,
    lpaAjHoje: 0.2 + i * 0.12,
    vpaAjHoje: 1 + i * 0.3,
    dpaAjHoje: DPA[i],
    payoutDmplPct: ano === 2025 ? 161 : 50,
    rendCota: null,
    vpCotaFim: null,
  };
}

function ativo(
  symbol: string,
  over: Partial<DadosAtivoValuation> = {},
  linhaOver: Partial<AnaliseQuadroLinha> = {},
): DadosAtivoValuation {
  return {
    linha: paraLinhaQuadroApi(linhaQuadroDb({ symbol, ...linhaOver })),
    regua: 'acao',
    atual: atual(),
    anuais: ANOS.map((a, i) => anual(a, i)),
    perShare: ANOS.map((a, i) => perShare(i, a)),
    fys: ANOS.map((a, i) => ({
      anoFiscal: a,
      receita: 10e9 * 1.1 ** i,
      lucro: 1e9 * 1.2 ** i,
    })),
    mensal: [],
    ...over,
  };
}

const par = (symbol: string, pl: number | null) =>
  ativo(symbol, { atual: atual({ pl, naoSeAplica: [] }) });

function wege(over: Partial<DadosAtivoValuation> = {}) {
  return ativo('WEGE3', over, { flags: ['provento_suspeito'] });
}

function grupo(r: ValuationResposta, codigo: string) {
  return r.grupos.find((g) => g.codigo === codigo)!;
}
function item(r: ValuationResposta, codigo: string): ItemValuation {
  return r.grupos.flatMap((g) => g.itens).find((i) => i.codigo === codigo)!;
}

/** Todas as strings da resposta, menos nomes de empresa (dado da fonte). */
function textos(r: ValuationResposta): string[] {
  const out: string[] = [];
  const andar = (v: unknown, chave = '') => {
    if (typeof v === 'string') {
      if (chave !== 'nome') out.push(v);
    } else if (Array.isArray(v)) v.forEach((x) => andar(x));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => andar(x, k));
  };
  andar(r);
  return out;
}

describe('montarValuation (ações)', () => {
  it('grupos na ordem, com rótulos de textosTela', () => {
    const r = montarValuation({
      hoje: HOJE,
      alvo: wege(),
      pares: [par('A3', 10), par('B3', 12), par('C3', 8)],
      criterioPares: TEXTOS_TELA.ativo.criterioParesAcao,
    });
    expect(r.grupos.map((g) => g.codigo)).toEqual([
      'preco',
      'proventos',
      'lucratividade',
      'crescimento',
      'alavancagem',
    ]);
    expect(grupo(r, 'preco').itens.map((i) => i.codigo)).toEqual([
      'pl',
      'pvp',
      'pReceita',
      'evEbitda',
      'pFco',
      'pFcl',
      'lpa',
      'vpa',
    ]);
    expect(item(r, 'pl').leitura).toBe(TEXTOS_TELA.leituras.pl.definicao);
  });

  it('referência = mediana de pelo menos 3 pares; com menos, "sem referência de pares"', () => {
    const r3 = montarValuation({
      hoje: HOJE,
      alvo: wege(),
      pares: [par('A3', 10), par('B3', 12), par('C3', 8), par('D3', null)],
      criterioPares: '',
    });
    expect(item(r3, 'pl').referencia).toEqual({ valor: 10, rotulo: 'mediana de 3 pares' });
    const r2 = montarValuation({
      hoje: HOJE,
      alvo: wege(),
      pares: [par('A3', 10), par('B3', null), par('C3', 8)],
      criterioPares: '',
    });
    expect(item(r2, 'pl').referencia).toEqual({
      valor: null,
      rotulo: TEXTOS_TELA.ativo.semReferenciaPares,
    });
  });

  it('resumo do grupo conta só as barras visíveis', () => {
    const r = montarValuation({ hoje: HOJE, alvo: wege(), pares: [], criterioPares: '' });
    const preco = grupo(r, 'preco');
    const visiveis = preco.itens.filter((i) => i.barra.visivel);
    const abaixo = visiveis.filter(
      (i) => i.atual.estado === 'ok' && i.atual.valor < (i.barra.media as number),
    ).length;
    expect(preco.resumo).toBe(
      `${abaixo} de ${visiveis.length} indicadores de preço estão abaixo da própria média histórica (até 10 anos).`,
    );
  });

  it('proventos em conferência (WEGE3): DPA, DY e payout com barra oculta; resumo diz por quê', () => {
    const r = montarValuation({ hoje: HOJE, alvo: wege(), pares: [], criterioPares: '' });
    for (const c of ['dpa12m', 'dy12m', 'payout']) {
      expect(item(r, c).barra).toMatchObject({ visivel: false, statusTexto: TV.barraConferencia });
      expect(item(r, c).atual.estado).toBe('ok'); // valor real com aviso, nunca escondido
    }
    expect(grupo(r, 'proventos').resumo).toBe(
      'Indicadores de proventos em conferência: as barras ficam ocultas até a conferência terminar.',
    );
    // DY médio 5a sem o ano em conferência (2025): média de 2021–2024
    expect(item(r, 'dyMedio5a').atual).toEqual(ok(1.5));
  });

  it('crescimento: CAGR 5a pelo utilitário único; extremo em conferência fica fora', () => {
    const r = montarValuation({ hoje: HOJE, alvo: wege(), pares: [], criterioPares: '' });
    const lucro = item(r, 'cagrLucro');
    expect(lucro.atual.estado).toBe('ok');
    expect((lucro.atual as { valor: number }).valor).toBeCloseTo(20, 1);
    expect(lucro.barra.visivel).toBe(false);
    expect(item(r, 'cagrDividendo').atual).toMatchObject({
      estado: 'ausente',
      motivo: 'extremo_em_conferencia',
      texto: TEXTOS_TELA.ativo.cagrForaConferencia,
    });
    expect(grupo(r, 'crescimento').resumo).toBe(TV.resumoCrescimento);
  });

  it('histórico curto: barras ocultas e CAGR "—" com o motivo', () => {
    const curto = ativo('AURE3', {
      anuais: [2022, 2023, 2024, 2025].map((a, i) => anual(a, i)),
      perShare: [2022, 2023, 2024, 2025].map((a, i) => perShare(i, a)),
      fys: [2022, 2023, 2024, 2025].map((a) => ({ anoFiscal: a, receita: 1e9, lucro: 1e8 })),
    });
    const r = montarValuation({ hoje: HOJE, alvo: curto, pares: [], criterioPares: '' });
    expect(item(r, 'pvp').barra.statusTexto).toBe(TEXTOS_TELA.ativo.barraOculta);
    expect(item(r, 'cagrReceita').atual).toMatchObject({
      estado: 'ausente',
      texto: TEXTOS_TELA.motivosPorSufixo.historico_curto,
    });
    expect(grupo(r, 'preco').resumo).toBe(
      'Nenhum indicador de preço tem 5 anos ou mais de histórico para comparar.',
    );
  });

  it('prejuízo em 12 meses: P/L "—" com o motivo', () => {
    const r = montarValuation({
      hoje: HOJE,
      alvo: ativo('AURE3', { atual: atual({ lpaTtm: -1.04, pl: null, payoutPct: null }) }),
      pares: [],
      criterioPares: '',
    });
    expect(item(r, 'pl').atual).toMatchObject({
      estado: 'ausente',
      texto: TEXTOS_TELA.ausentesPorCampo.plPrejuizo,
    });
    expect(item(r, 'payout').atual).toMatchObject({
      estado: 'ausente',
      texto: TEXTOS_TELA.motivosPorSufixo.prejuizo,
    });
  });

  it('banco: Alavancagem traz a explicação no lugar dos cartões; margem/ROIC/EV saem', () => {
    const r = montarValuation({
      hoje: HOJE,
      alvo: ativo('ITUB4', {
        regua: 'acao_financeira',
        atual: atual({ naoSeAplica: ['margemLiquidaPct', 'evEbitda', 'pReceita', 'roicPct'] }),
      }),
      pares: [],
      criterioPares: '',
    });
    const alav = grupo(r, 'alavancagem');
    expect(alav.itens).toEqual([]);
    expect(alav.explicacao).toBe(TV.explicacaoFinanceira);
    const codigos = r.grupos.flatMap((g) => g.itens.map((i) => i.codigo));
    for (const c of ['margemLiquida', 'roic', 'evEbitda', 'pReceita', 'cagrReceita']) {
      expect(codigos).not.toContain(c);
    }
    expect(codigos).toContain('roe');
  });

  it('históricos: P/L e P/VP com a média dos anos fechados', () => {
    const r = montarValuation({ hoje: HOJE, alvo: wege(), pares: [], criterioPares: '' });
    expect(r.historicos.map((h) => h.codigo)).toEqual(['pl', 'pvp']);
    expect(r.historicos[0].pontos).toHaveLength(10);
    expect(r.historicos[0].pontos[0].ano).toBe(2016);
    expect(r.historicos[0].media).toBeCloseTo(33, 5); // 2016–2025: 24..42, passo 2
  });

  it('pares: próprio ativo primeiro; linhas enxutas (sem série) e critério', () => {
    const r = montarValuation({
      hoje: HOJE,
      alvo: wege(),
      pares: [par('A3', 10)],
      criterioPares: TEXTOS_TELA.ativo.criterioParesAcao,
    });
    expect(r.pares.itens.map((l) => l.ticker)).toEqual(['WEGE3', 'A3']);
    expect(r.pares.itens[0].serie10a).toEqual([]);
    expect(r.pares.criterio).toBe(TEXTOS_TELA.ativo.criterioParesAcao);
    expect(linhaParEnxuta(r.pares.itens[1]).ticker).toBe('A3');
  });

  it('nenhuma referência a índice de mercado e nenhuma palavra proibida', () => {
    const r = montarValuation({
      hoje: HOJE,
      alvo: wege(),
      pares: [par('A3', 10), par('B3', 12), par('C3', 8)],
      criterioPares: TEXTOS_TELA.ativo.criterioParesAcao,
    });
    const todos = textos(r);
    expect(todos.filter((t) => /ibovespa|ifix|\bibov\b|s&p/i.test(t))).toEqual([]);
    expect(todos.flatMap((t) => encontrarPalavrasProibidas(t))).toEqual([]);
    expect(todos.filter((t) => /\b(comprar?|recomenda\w*|nota)\b/i.test(t))).toEqual([]);
  });
});

describe('montarValuation (FIIs)', () => {
  function fii(
    over: Partial<DadosAtivoValuation> = {},
    linhaOver: Partial<AnaliseQuadroLinha> = {},
  ) {
    const anos = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
    return ativo(
      'HGLG11',
      {
        regua: 'fii_tijolo',
        atual: atual({
          pvp: 0.89,
          vpCota: 165.95,
          rend12m: 13.2,
          dy12mPct: 8.9,
          obrigacoesPlPct: 16.2,
        }),
        anuais: anos.map((a, i) =>
          anual(a, i, {
            pvp: 1 + i / 20,
            dyPct: 8,
            vpCota: a === 2017 ? 1127 : 120 + i * 5,
            rendCota12m: a === 2017 ? 70 : 10 + i / 2,
            vacanciaFisicaCvmPct: 5 + i / 4,
            obrigacoesPlPct: 10,
          }),
        ),
        perShare: anos.map((a, i) => ({
          anoFiscal: a,
          lpaAjHoje: null,
          vpaAjHoje: null,
          dpaAjHoje: null,
          payoutDmplPct: null,
          rendCota: a === 2017 ? 70 : 10 + i / 2,
          vpCotaFim: a === 2017 ? 1127 : 120 + i * 5,
        })),
        fys: [],
        mensal: [
          { refMonth: '2018-04-01', cotistas: 12_000, taxaAdmPct: 0.06, fatorDesdobramento: 10 },
          ...[2020, 2021, 2022, 2023, 2024, 2025].map((a, i) => ({
            refMonth: `${a}-12-01`,
            cotistas: 100_000 * 1.2 ** i,
            taxaAdmPct: 0.05,
            fatorDesdobramento: null,
          })),
        ],
        ...over,
      },
      { classe: 'fii', fiiTipo: 'tijolo', vacanciaFisicaCvmPct: 2.41, ...linhaOver },
    );
  }

  it('grupos de FII; VP/cota antes do desdobramento na base de hoje', () => {
    const r = montarValuation({ hoje: HOJE, alvo: fii(), pares: [], criterioPares: '' });
    expect(r.grupos.map((g) => g.codigo)).toEqual([
      'preco',
      'proventos',
      'qualidadeRenda',
      'crescimento',
      'alavancagem',
    ]);
    const vp = item(r, 'vpCota');
    expect(vp.historico[0]).toEqual({ ano: 2017, valor: 112.7 });
    expect(vp.barra.min).toBe(112.7);
    expect(item(r, 'vacanciaCvm').atual).toEqual(ok(2.41));
    expect(item(r, 'taxaAdm').atual).toEqual(ok(0.05));
    expect(item(r, 'cagrCotistas').atual.estado).toBe('ok');
    expect((item(r, 'cagrCotistas').atual as { valor: number }).valor).toBeCloseTo(20, 5);
    expect(r.historicos.map((h) => h.codigo)).toEqual(['pvp', 'dy12m']);
  });

  it('papel: Qualidade da renda com a explicação (vacância não se aplica)', () => {
    const r = montarValuation({
      hoje: HOJE,
      alvo: fii({}, { fiiTipo: 'papel' }),
      pares: [],
      criterioPares: '',
    });
    const q = grupo(r, 'qualidadeRenda');
    expect(q.itens).toEqual([]);
    expect(q.explicacao).toBe(TV.explicacaoPapel);
  });
});

describe('obterValuation', () => {
  beforeEach(() => {
    Object.values(mockPrisma).forEach((m) =>
      Object.values(m).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset()),
    );
    Object.values(mockLeitor).forEach((f) => f.mockReset());
    mockAcoes.fundamentosVigentes.mockReset();
  });

  it('ticker fora da área ⇒ null', async () => {
    mockLeitor.obterLinhaQuadro.mockResolvedValue(null);
    expect(await obterValuation('ZZZZ3', HOJE)).toBeNull();
  });

  it('ação: uma leitura por tabela para alvo + pares e cache por ticker:versão', async () => {
    const linhas = [
      linhaQuadroDb({
        symbol: 'WEGE3',
        cnpj: 'c1',
        segmento: 'S',
        subsetor: 'Sub',
        valorMercado: new Prisma.Decimal('100'),
      }),
      linhaQuadroDb({
        symbol: 'SHUL4',
        cnpj: 'c2',
        segmento: 'S',
        subsetor: 'Sub',
        valorMercado: new Prisma.Decimal('10'),
      }),
    ];
    mockLeitor.obterLinhaQuadro.mockImplementation(
      async (s: string) => linhas.find((l) => l.symbol === s) ?? null,
    );
    mockLeitor.versaoQuadro.mockResolvedValue('v-val-1');
    mockLeitor.obterLinhasQuadroApi.mockResolvedValue(linhas.map(paraLinhaQuadroApi));
    mockPrisma.assetMultiplesCurrent.findMany.mockResolvedValue([
      { symbol: 'WEGE3', ...atual() },
      { symbol: 'SHUL4', ...atual({ pl: 12 }) },
    ]);
    mockPrisma.assetMultiplesYearly.findMany.mockResolvedValue(
      ANOS.map((a, i) => ({ symbol: 'WEGE3', ...anual(a, i) })),
    );
    mockPrisma.assetPerShareYearly.findMany.mockResolvedValue(
      ANOS.map((a, i) => ({ symbol: 'WEGE3', ...perShare(i, a) })),
    );
    mockAcoes.fundamentosVigentes.mockResolvedValue([]);

    const r1 = await obterValuation('WEGE3', HOJE);
    expect(r1?.cache).toBe(false);
    expect(r1?.dados.pares.itens.map((l) => l.ticker)).toEqual(['WEGE3', 'SHUL4']);
    expect(mockPrisma.assetMultiplesCurrent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { symbol: { in: ['WEGE3', 'SHUL4'] } } }),
    );
    expect(mockAcoes.fundamentosVigentes).toHaveBeenCalledWith(mockPrisma, ['c1', 'c2'], {
      tipos: ['FY'],
      desde: '2014-01-01',
    });
    expect(mockPrisma.fiiMonthly.findMany).not.toHaveBeenCalled();
    const r2 = await obterValuation('WEGE3', HOJE);
    expect(r2?.cache).toBe(true);
    expect(mockPrisma.assetMultiplesYearly.findMany).toHaveBeenCalledTimes(1);
  });
});
