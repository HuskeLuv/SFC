import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  assetPerShareYearly: { findMany: vi.fn() },
  assetMultiplesYearly: { findMany: vi.fn() },
  assetMultiplesCurrent: { findUnique: vi.fn() },
  fiiQuarterly: { findMany: vi.fn() },
  fiiMonthly: { findMany: vi.fn() },
}));
const mockLeitor = vi.hoisted(() => ({ obterLinhaQuadro: vi.fn(), versaoQuadro: vi.fn() }));
const mockAcoes = vi.hoisted(() => ({ fundamentosVigentes: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', () => mockLeitor);
vi.mock('@/services/analiseAtivos/repositorio/acoes', () => mockAcoes);

import {
  fatorCotasApos,
  hojeSaoPaulo,
  montarFundamentosAcao,
  montarFundamentosFii,
  obterFundamentosEssencial,
  type EntradaFundamentosAcao,
  type EntradaFundamentosFii,
  type TrimestreFii,
} from '../fundamentosEssencial';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { TEXTOS_ATIVO } from '@/services/analiseAtivos/textosAtivo';
import { linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
import type { FundamentosPeriodo } from '@/services/analiseAtivos/tipos';
import { MOTIVO_PER_SHARE } from '@/services/analiseAtivos/regras/conferencia/conferenciaAnual';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import fixtures from '@/test/fixtures/analiseAtivos/raio-x-dev.json';
import type { Estado, FundamentosResposta } from '@/types/analiseAtivosApi';

const HOJE = '2026-10-02';
const TF = TEXTOS_TELA.analise.fundamentos;
const TE = TEXTOS_ATIVO.essencial;
/** Essencial da página (v2.4); sem a opção = layout legado, base do Raio-X */
const V24 = { layout: 'v24' } as const;

function periodo(ano: number, over: Partial<FundamentosPeriodo> = {}): FundamentosPeriodo {
  return {
    emissorId: '84429695000111',
    docTipo: 'DFP',
    tipoPeriodo: 'FY',
    escopo: 'con',
    padraoContabil: 'IFRS',
    dtIni: `${ano}-01-01`,
    dtFim: `${ano}-12-31`,
    anoFiscal: ano,
    trimestreFiscal: null,
    versao: 1,
    dtEntregaOriginal: `${ano + 1}-02-20`,
    receita: 10_000e6 + (ano - 2014) * 2_500e6,
    lucroBruto: null,
    ebit: null,
    depreciacaoAmortizacao: null,
    lucroLiquido: 1_000e6 + (ano - 2014) * 500e6,
    lucroAtribuivel: 1_000e6 + (ano - 2014) * 500e6,
    ativoTotal: null,
    ativoCirculante: null,
    passivoCirculante: null,
    caixa: null,
    aplicacoesFinanceiras: null,
    dividaBrutaCp: null,
    dividaBrutaLp: null,
    pl: null,
    plControladora: null,
    fco: null,
    fci: null,
    fcf: null,
    capex: null,
    dividendosJcpPagos: null,
    dmplDeclarado: null,
    lpaOn: null,
    lpaPn: null,
    naoSeAplica: [],
    flags: [],
    ...over,
  };
}

const ANOS = Array.from({ length: 12 }, (_, i) => 2014 + i); // 2014–2025
const DPA = [0.14, 0.15, 0.14, 0.14, 0.16, 0.17, 0.22, 0.44, 0.52, 0.61, 0.76, 2.45];
const PAYOUT = [54, 54, 54, 50, 49, 44, 39, 49, 51, 45, 52, 161];

function entradaWege(over: Partial<EntradaFundamentosAcao> = {}): EntradaFundamentosAcao {
  return {
    hoje: HOJE,
    financeira: false,
    fys: ANOS.map((a) => periodo(a)),
    ttm: periodo(2026, { tipoPeriodo: 'TTM', dtIni: '2025-07-01', dtFim: '2026-06-30' }),
    perShare: ANOS.map((a, i) => ({
      anoFiscal: a,
      lpaAjHoje: 0.2 + i * 0.12,
      dpaAjHoje: DPA[i],
      payoutDmplPct: PAYOUT[i],
    })),
    multiplos: ANOS.map((a, i) => ({
      anoFiscal: a,
      pl: 20 + i,
      pvp: 4 + i / 2,
      dyPct: 1.5,
      roePct: 18 + i,
      margemLiquidaPct: 12,
      payoutPct: PAYOUT[i],
    })),
    atual: {
      pl: 33.7,
      pvp: 11.19,
      dy12mPct: 3.98,
      roePct: 33.16,
      margemLiquidaPct: 16.63,
      payoutPct: 134.4,
      lpaTtm: 1.49,
      dpa12m: 2.0,
    },
    proventosEmConferencia: true,
    ...over,
  };
}

const valor = (e: Estado<number> | undefined) => (e?.estado === 'ok' ? e.valor : null);
const linha = (r: FundamentosResposta, rotulo: string) =>
  r.linhas.find((l) => l.rotulo === rotulo)!;

describe('montarFundamentosAcao', () => {
  it('WEGE3: 10 anos FECHADOS (sem o ano corrente), último ano em ultimoAno + Últ. 12m', () => {
    const r = montarFundamentosAcao(entradaWege(), V24);
    const anos = r.linhas.filter((l) => l.ano !== null).map((l) => l.ano);
    expect(anos).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
    expect(r.linhas.some((l) => l.rotulo === '2026')).toBe(false);
    expect(r.linhas.filter((l) => l.ultimoAno).map((l) => l.ano)).toEqual([2025]);
    // v2.4: `destaque` sai do JSON (nenhuma chave /destaque/)
    expect(JSON.stringify(r)).not.toMatch(/destaque/i);
    const ttm = r.linhas[r.linhas.length - 1];
    expect(ttm.rotulo).toBe(TEXTOS_TELA.ativo.ult12mTabela);
    expect(ttm.ano).toBeNull();
    expect(valor(ttm.valores.pl)).toBe(33.7);
    expect(r.variante).toBe('acao');
    // v2.4: ordem do HTML do Pedro (§3.2 bloco 5)
    expect(r.colunas.map((c) => c.codigo)).toEqual([
      'receita',
      'ebitda',
      'lucro',
      'margem',
      'dl',
      'dlEbitda',
      'fclCapex',
      'roe',
      'lpa',
      'dpa',
      'payout',
      'pl',
      'pvp',
      'dy',
    ]);
    expect(r.colunas.find((c) => c.codigo === 'lucro')?.rotulo).toBe('Lucro descontado ⓘ');
    expect(r.colunas.find((c) => c.codigo === 'margem')?.rotulo).toBe('Margem descontada ⓘ');
    expect(r.unidade).toBe('R$ bi');
    expect(r.observacoes[0]).toBe(TE.unidadeAcao);
  });

  it('valores em R$ bi e lucro atribuível', () => {
    const r = montarFundamentosAcao(entradaWege(), V24);
    const l2025 = linha(r, '2025');
    expect(valor(l2025.valores.receita)).toBe(37.5);
    expect(valor(l2025.valores.lucro)).toBe(6.5);
  });

  it('EBITDA = EBIT + D&A, dívida líquida, Dív. líq./EBITDA e FCL/CAPEX (nunca o campo fcf)', () => {
    const f = (a: number) =>
      periodo(a, {
        ebit: 7_000e6,
        depreciacaoAmortizacao: 1_000e6,
        dividaBrutaCp: 1_000e6,
        dividaBrutaLp: 2_000e6,
        caixa: 4_000e6,
        aplicacoesFinanceiras: 1_400e6,
        fco: 6_000e6,
        capex: 1_500e6,
        fcf: 999e6,
      });
    const r = montarFundamentosAcao(entradaWege({ fys: ANOS.map(f) }), V24);
    const v = linha(r, '2025').valores;
    expect(valor(v.ebitda)).toBe(8);
    // 3,0 − 4,0 − 1,4 = −2,4 bi (caixa líquido)
    expect(valor(v.dl)).toBe(-2.4);
    expect(valor(v.dlEbitda)).toBe(-0.3);
    // (6,0 − 1,5) ÷ 1,5 = 3,0×
    expect(valor(v.fclCapex)).toBe(3);
    expect(r.colunas.find((c) => c.codigo === 'dlEbitda')?.formato).toBe('multiplo');
    expect(r.colunas.find((c) => c.codigo === 'fclCapex')?.formato).toBe('multiplo');
  });

  it('EBITDA ≤ 0: Dív. líq./EBITDA sem número, com o motivo; sem D&A ou sem caixa = sem dado', () => {
    const r = montarFundamentosAcao(
      entradaWege({
        fys: ANOS.map((a) =>
          a === 2025
            ? periodo(a, {
                ebit: -500e6,
                depreciacaoAmortizacao: 100e6,
                dividaBrutaLp: 1_000e6,
                caixa: 100e6,
              })
            : periodo(a, { ebit: 1_000e6, dividaBrutaLp: 1_000e6, caixa: 100e6 }),
        ),
      }),
      V24,
    );
    expect(linha(r, '2025').valores.dlEbitda).toEqual({
      estado: 'ausente',
      motivo: 'ebitda_nao_positivo',
      texto: TE.ebitdaNaoPositivo,
    });
    expect(linha(r, '2024').valores.ebitda.estado).toBe('ausente');
    expect(linha(r, '2024').valores.dlEbitda.estado).toBe('ausente');
    expect(valor(linha(r, '2024').valores.dl)).toBe(0.9);
    expect(linha(r, '2024').valores.fclCapex.estado).toBe('ausente');
  });

  it('margem: sem o múltiplo do ano, lucro ÷ receita', () => {
    const r = montarFundamentosAcao(
      entradaWege({
        multiplos: ANOS.map((a) => ({
          anoFiscal: a,
          pl: 20,
          pvp: 4,
          dyPct: 1.5,
          roePct: 18,
          margemLiquidaPct: null,
          payoutPct: 50,
        })),
      }),
      V24,
    );
    // 2025: 6.500 ÷ 37.500 = 17,33%
    expect(valor(linha(r, '2025').valores.margem)).toBeCloseTo(17.3333, 3);
  });

  it('margem: receita ≤ lucro (holding / banco no individual) = não se aplica, nunca 148,8%', () => {
    const r = montarFundamentosAcao(
      entradaWege({
        fys: ANOS.map((a) =>
          periodo(a, { receita: 30_680e6, lucroLiquido: 45_659e6, lucroAtribuivel: 45_659e6 }),
        ),
        multiplos: ANOS.map((a) => ({
          anoFiscal: a,
          pl: 20,
          pvp: 4,
          dyPct: 1.5,
          roePct: 18,
          margemLiquidaPct: null,
          payoutPct: 50,
        })),
      }),
      V24,
    );
    expect(linha(r, '2025').valores.margem).toMatchObject({
      estado: 'nao_se_aplica',
      motivo: 'receita_menor_que_lucro',
    });
  });

  it('receita 0 (holding sem receita própria, ex.: BBSE3) = não se aplica, nunca "R$ 0,0 bi"', () => {
    const r = montarFundamentosAcao(
      entradaWege({
        fys: ANOS.map((a) =>
          periodo(a, { receita: 0, lucroLiquido: 9_017e6, lucroAtribuivel: 9_017e6 }),
        ),
        multiplos: ANOS.map((a) => ({
          anoFiscal: a,
          pl: 9,
          pvp: 6,
          dyPct: 9,
          roePct: 70,
          margemLiquidaPct: null,
          payoutPct: 90,
        })),
      }),
      V24,
    );
    for (const campo of ['receita', 'margem'] as const) {
      expect(linha(r, '2025').valores[campo]).toMatchObject({
        estado: 'nao_se_aplica',
        motivo: 'receita_nao_positiva',
      });
    }
    // a receita marcada 'não se aplica' na ingestão também
    const m = montarFundamentosAcao(
      entradaWege({ fys: ANOS.map((a) => periodo(a, { naoSeAplica: ['receita'] })) }),
      V24,
    );
    expect(linha(m, '2025').valores.receita).toMatchObject({ estado: 'nao_se_aplica' });
  });

  it('Div./ação > 2× o ano anterior com payout > 150%: selo de proventos em conferência + nota', () => {
    const r = montarFundamentosAcao(entradaWege(), V24);
    expect(linha(r, '2025').selos).toEqual(['proventos_em_conferencia']);
    // 2021 dobrou (0,22 → 0,44) com payout de 49%: salto real, sem selo
    expect(linha(r, '2021').selos).toEqual([]);
    expect(r.observacoes).toContain(TF.notaProventosConferencia);
  });

  it('sem período mais recente que o último ano fechado: sem linha Últ. 12m', () => {
    const r = montarFundamentosAcao(
      entradaWege({ ttm: periodo(2025, { tipoPeriodo: 'TTM' }) }),
      V24,
    );
    expect(r.linhas.every((l) => l.ano !== null)).toBe(true);
  });

  it('ITUB4 (banco, D4): receita e margem ficam; EBITDA, DL e FCL saem; nota BR GAAP', () => {
    const r = montarFundamentosAcao(
      entradaWege({
        financeira: true,
        fys: ANOS.map((a) => periodo(a, { escopo: 'ind', padraoContabil: 'BRGAAP' })),
        ttm: periodo(2026, {
          tipoPeriodo: 'TTM',
          escopo: 'ind',
          padraoContabil: 'BRGAAP',
          dtFim: '2026-06-30',
        }),
        proventosEmConferencia: false,
      }),
      V24,
    );
    expect(r.colunas.map((c) => c.codigo)).toEqual([
      'receita',
      'lucro',
      'margem',
      'roe',
      'lpa',
      'dpa',
      'payout',
      'pl',
      'pvp',
      'dy',
    ]);
    expect(valor(linha(r, '2025').valores.receita)).toBe(37.5);
    expect(linha(r, '2025').valores.ebitda.estado).toBe('nao_se_aplica');
    expect(linha(r, '2025').valores.fclCapex.estado).toBe('nao_se_aplica');
    expect(r.padraoContabil).toBe('BRGAAP');
    expect(r.escopo).toBe('ind');
    expect(r.observacoes).toContain('Padrão contábil: individual BR GAAP.');
    expect(r.observacoes).toContain(TE.notaFinanceira);
  });

  it('controladora_zero: usa o lucro do individual; sem individual, "—" com o motivo', () => {
    const comInd = periodo(2025, {
      lucroAtribuivel: null,
      lucroAtribuivelIndividual: 800e6,
      flags: ['controladora_zero'],
    });
    const semInd = periodo(2024, { lucroAtribuivel: null, flags: ['controladora_zero'] });
    const r = montarFundamentosAcao(
      entradaWege({ fys: [...ANOS.slice(0, 10).map((a) => periodo(a)), semInd, comInd] }),
      V24,
    );
    expect(valor(linha(r, '2025').valores.lucro)).toBe(0.8);
    const l2024 = linha(r, '2024').valores.lucro;
    expect(l2024).toEqual({
      estado: 'ausente',
      motivo: 'controladora_zero',
      texto: TEXTOS_TELA.motivosPorSufixo.controladora_zero,
    });
  });

  it('prejuízo no ano: P/L e payout "—" com o motivo, não o número da fonte', () => {
    const r = montarFundamentosAcao(
      entradaWege({
        fys: ANOS.map((a) =>
          a === 2023 ? periodo(a, { lucroAtribuivel: -318e6, lucroLiquido: -318e6 }) : periodo(a),
        ),
        multiplos: ANOS.map((a) => ({
          anoFiscal: a,
          pl: null,
          pvp: 1,
          dyPct: 22.5,
          roePct: -2.6,
          margemLiquidaPct: -5,
          payoutPct: -744,
        })),
      }),
      V24,
    );
    const l = linha(r, '2023');
    expect(l.valores.payout).toMatchObject({ estado: 'ausente', texto: TF.prejuizoNoAno });
    expect(l.valores.pl).toMatchObject({ estado: 'ausente', texto: TF.prejuizoNoAno });
  });

  it('histórico curto: só os anos que existem', () => {
    const r = montarFundamentosAcao(
      entradaWege({ fys: [2022, 2023, 2024, 2025].map((a) => periodo(a)), ttm: null }),
      V24,
    );
    expect(r.linhas.map((l) => l.ano)).toEqual([2022, 2023, 2024, 2025]);
  });
  it('sem a opção: layout LEGADO, base do Raio-X (R$ mi, banco sem receita e margem)', () => {
    const r = montarFundamentosAcao(entradaWege());
    expect(r.unidade).toBe('R$ mi');
    expect(valor(linha(r, '2025').valores.receita)).toBe(37_500);
    expect(valor(linha(r, '2025').valores.lucro)).toBe(6_500);
    expect(r.colunas.map((c) => c.codigo)).toEqual([
      'receita',
      'lucro',
      'margem',
      'roe',
      'lpa',
      'dpa',
      'payout',
      'pl',
      'pvp',
      'dy',
    ]);
    expect(linha(r, '2025').ultimoAno).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/destaque/i);
    const banco = montarFundamentosAcao(entradaWege({ financeira: true }));
    expect(banco.colunas.map((c) => c.codigo)).not.toContain('receita');
    expect(banco.observacoes).toContain(TF.notaFinanceira);
  });
});

function trimestre(ref: string, over: Partial<TrimestreFii> = {}): TrimestreFii {
  return {
    refQuarter: ref,
    receitaAluguel: 100e6,
    resultadoTrimestral: 110e6,
    vacanciaFisicaCvmPct: 5,
    nImoveisRenda: 20,
    nImoveisOutros: 1,
    areaM2: 1_000_000,
    nCri: 0,
    maiorCriPct: null,
    flags: [],
    ...over,
  };
}

function trimestresDoAno(ano: number, n = 4, over: Partial<TrimestreFii> = {}): TrimestreFii[] {
  return ['03-31', '06-30', '09-30', '12-31']
    .slice(4 - n)
    .map((md) => trimestre(`${ano}-${md}`, over));
}

function entradaHglg(over: Partial<EntradaFundamentosFii> = {}): EntradaFundamentosFii {
  const anos = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
  return {
    hoje: HOJE,
    fiiTipo: 'tijolo',
    trimestres: [
      ...trimestresDoAno(2017, 3),
      ...[2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].flatMap((a) => trimestresDoAno(a)),
      trimestre('2026-03-31', { receitaAluguel: 140e6 }),
      trimestre('2026-06-30', { receitaAluguel: 190e6, nImoveisRenda: 37, nImoveisOutros: 0 }),
    ],
    perShare: anos.map((a) => ({
      anoFiscal: a,
      rendCota: a === 2026 ? 5.5 : a === 2017 ? 70 : 13.2,
      vpCotaFim: a === 2017 ? 1127.27 : 160,
    })),
    multiplos: anos.map((a) => ({
      anoFiscal: a,
      pvp: 1,
      dyPct: 8.4,
      vacanciaFisicaCvmPct: 4,
      nImoveisCvm: 28,
    })),
    atual: { pvp: 0.89, dy12mPct: 8.9, vpCota: 165.95, rend12m: 13.2 },
    desdobramentos: [{ refMonth: '2018-04-01', fator: 10 }],
    proventosEmConferencia: false,
    ...over,
  };
}

describe('montarFundamentosFii', () => {
  it('HGLG11: só anos fechados (2026 fora), ano com menos de 4 trimestres = "—" com nota', () => {
    const r = montarFundamentosFii(entradaHglg());
    expect(r.variante).toBe('fii_tijolo');
    expect(r.linhas.filter((l) => l.ano !== null).map((l) => l.ano)).toEqual([
      2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
    ]);
    expect(linha(r, '2017').valores.receita).toMatchObject({
      estado: 'ausente',
      texto: TEXTOS_TELA.ativo.anoIncompletoFii,
    });
    expect(valor(linha(r, '2025').valores.receita)).toBe(400);
    expect(valor(linha(r, '2025').valores.resultado)).toBe(440);
    expect(r.observacoes.some((n) => n.includes(TEXTOS_TELA.ativo.anoIncompletoFii))).toBe(true);
    expect(linha(r, '2025').ultimoAno).toBe(true);
  });

  it('valores por cota antes do desdobramento ficam na base de cotas de hoje', () => {
    const r = montarFundamentosFii(entradaHglg());
    expect(valor(linha(r, '2017').valores.vpCota)).toBeCloseTo(112.727, 3);
    expect(valor(linha(r, '2017').valores.rendCota)).toBe(7);
    expect(valor(linha(r, '2018').valores.vpCota)).toBe(160);
    expect(fatorCotasApos('2017-12-31', [{ refMonth: '2018-04-01', fator: 10 }])).toBe(10);
    expect(fatorCotasApos('2018-12-31', [{ refMonth: '2018-04-01', fator: 10 }])).toBe(1);
  });

  it('colunas de tijolo com aviso da fonte CVM; Últ. 12m com os 4 últimos trimestres', () => {
    const r = montarFundamentosFii(entradaHglg());
    expect(r.colunas.map((c) => c.codigo)).toEqual([
      'receita',
      'resultado',
      'rendCota',
      'dy',
      'vpCota',
      'pvp',
      'vacancia',
      'nImoveis',
      'area',
    ]);
    expect(r.colunas.filter((c) => c.fonteCvmAviso).map((c) => c.codigo)).toEqual([
      'vacancia',
      'nImoveis',
      'area',
    ]);
    // rec. 7: 'Área (CVM)' no lugar de ABL
    expect(r.colunas.find((c) => c.codigo === 'area')?.rotulo).toBe('Área (CVM)');
    const ttm = r.linhas[r.linhas.length - 1];
    expect(ttm.rotulo).toBe(TEXTOS_TELA.ativo.ult12mTabela);
    expect(valor(ttm.valores.receita)).toBe(530); // 100 + 100 + 140 + 190
    expect(valor(ttm.valores.nImoveis)).toBe(37);
    expect(r.observacoes).toContain(TF.notaCvmGestor);
  });

  it('KNCR11 (papel): Nº CRIs e Maior CRI no lugar das 3 últimas; sem aluguel, a receita sai', () => {
    const r = montarFundamentosFii(
      entradaHglg({
        fiiTipo: 'papel',
        trimestres: [2022, 2023, 2024, 2025].flatMap((a) =>
          trimestresDoAno(a, 4, {
            receitaAluguel: null,
            vacanciaFisicaCvmPct: null,
            nCri: 60 + a - 2022,
            maiorCriPct: 6.5,
            flags: ['nsa:vacanciaFisicaCvmPct'],
          }),
        ),
      }),
    );
    expect(r.variante).toBe('fii_papel');
    expect(r.colunas.map((c) => c.codigo)).toEqual([
      'resultado',
      'rendCota',
      'dy',
      'vpCota',
      'pvp',
      'nCri',
      'maiorCri',
    ]);
    expect(valor(linha(r, '2025').valores.nCri)).toBe(63);
    expect(r.observacoes).not.toContain(TF.notaCvmGestor);
  });

  it('rendimento > 2× o ano anterior: selo de proventos em conferência', () => {
    const r = montarFundamentosFii(
      entradaHglg({
        perShare: [2021, 2022, 2023, 2024, 2025].map((a) => ({
          anoFiscal: a,
          rendCota: a === 2022 ? 12.8 : 5.4,
          vpCotaFim: 100,
        })),
      }),
    );
    expect(linha(r, '2022').selos).toEqual(['proventos_em_conferencia']);
  });
});

describe('decisão 1 — base por ação quebrada (CBAV3, dados do DEV)', () => {
  const cbav = fixtures.CBAV3;
  const entradaCbav = (): EntradaFundamentosAcao => ({
    hoje: HOJE,
    financeira: false,
    fys: cbav.periodos.filter((p) => p.tipoPeriodo === 'FY') as unknown as FundamentosPeriodo[],
    ttm: null,
    perShare: cbav.perShare,
    multiplos: cbav.multiplos,
    atual: null,
    proventosEmConferencia: false,
    conferencia: { flags: cbav.linha.flags, motivos: cbav.linha.motivosIncompleto },
  });

  it('LPA, P/L e P/VP de 2021, 2022, 2024 e 2025 ficam "em conferência" (ocultar)', () => {
    const r = montarFundamentosAcao(entradaCbav());
    for (const ano of [2021, 2022, 2024, 2025]) {
      const l = linha(r, String(ano));
      expect(l.valores.lpa).toMatchObject({
        estado: 'ausente',
        motivo: MOTIVO_PER_SHARE,
        exibicao: 'ocultar',
      });
      for (const c of ['pl', 'pvp']) {
        if (l.valores[c].estado !== 'ausente') throw new Error(`${ano} ${c} visível`);
      }
    }
    expect(linha(r, '2025').valores.lpa).toMatchObject({
      texto: TEXTOS_RAIO_X.conferencia.acoesAbaixoMediana,
    });
    expect(linha(r, '2021').valores.lpa).toMatchObject({
      texto: TEXTOS_RAIO_X.conferencia.saltoAcoes,
      valorNaoPublicado: 837.1804,
    });
  });

  it('o resto da linha fica igual (receita, lucro, ROE, DY) e 2023 continua visível', () => {
    const r = montarFundamentosAcao(entradaCbav());
    const l2024 = linha(r, '2024');
    expect(valor(l2024.valores.receita)).toBeCloseTo(8173.649, 3);
    expect(valor(l2024.valores.lucro)).toBeCloseTo(-180.671, 3);
    expect(valor(linha(r, '2023').valores.lpa)).toBeCloseTo(-1.4061, 4);
  });

  it('WEGE3 (sem base quebrada): nada muda', () => {
    const w = fixtures.WEGE3;
    const r = montarFundamentosAcao({
      ...entradaCbav(),
      fys: w.periodos.filter((p) => p.tipoPeriodo === 'FY') as unknown as FundamentosPeriodo[],
      perShare: w.perShare,
      multiplos: w.multiplos,
      conferencia: { flags: w.linha.flags, motivos: w.linha.motivosIncompleto },
    });
    expect(r.linhas.every((l) => l.valores.lpa.estado === 'ok')).toBe(true);
  });

  it('FII: só as flags do ano (sem mediana — emissões não são erro de base)', () => {
    const r = montarFundamentosFii(
      entradaHglg({
        perShare: [2021, 2022, 2023, 2024, 2025].map((a) => ({
          anoFiscal: a,
          rendCota: 13,
          vpCotaFim: 160,
          flags: a === 2023 ? ['salto_acoes_sem_evento', 'dados_incompletos'] : [],
        })),
      }),
    );
    expect(linha(r, '2023').valores.vpCota).toMatchObject({ motivo: MOTIVO_PER_SHARE });
    expect(linha(r, '2023').valores.rendCota).toMatchObject({ motivo: MOTIVO_PER_SHARE });
    expect(valor(linha(r, '2023').valores.pvp)).toBe(1);
    expect(valor(linha(r, '2024').valores.vpCota)).toBe(160);
  });
});

describe('obterFundamentosEssencial', () => {
  beforeEach(() => {
    Object.values(mockPrisma).forEach((m) =>
      Object.values(m).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset()),
    );
    mockLeitor.obterLinhaQuadro.mockReset();
    mockLeitor.versaoQuadro.mockReset();
    mockAcoes.fundamentosVigentes.mockReset();
  });

  it('ticker fora da área ⇒ null, sem consultar as tabelas', async () => {
    mockLeitor.obterLinhaQuadro.mockResolvedValue(null);
    expect(await obterFundamentosEssencial('ZZZZ3', HOJE)).toBeNull();
    expect(mockPrisma.assetPerShareYearly.findMany).not.toHaveBeenCalled();
  });

  it('ação: lê só o banco e guarda em memória por ticker:versão', async () => {
    mockLeitor.obterLinhaQuadro.mockResolvedValue(
      linhaQuadroDb({ symbol: 'WEGE3', cnpj: '84429695000111', flags: ['provento_suspeito'] }),
    );
    mockLeitor.versaoQuadro.mockResolvedValue('v-teste-1');
    const e = entradaWege();
    mockAcoes.fundamentosVigentes.mockResolvedValue([...e.fys, e.ttm]);
    mockPrisma.assetPerShareYearly.findMany.mockResolvedValue(e.perShare);
    mockPrisma.assetMultiplesYearly.findMany.mockResolvedValue(e.multiplos);
    mockPrisma.assetMultiplesCurrent.findUnique.mockResolvedValue(e.atual);

    const r1 = await obterFundamentosEssencial('WEGE3', HOJE);
    expect(r1?.cache).toBe(false);
    expect(r1?.dados.linhas).toHaveLength(11);
    expect(r1?.dados.linhas[10].selos).toEqual(['proventos_em_conferencia']);
    expect(mockAcoes.fundamentosVigentes).toHaveBeenCalledWith(mockPrisma, ['84429695000111'], {
      tipos: ['FY', 'TTM'],
      desde: '2014-01-01',
    });
    const r2 = await obterFundamentosEssencial('WEGE3', HOJE);
    expect(r2?.cache).toBe(true);
    expect(mockPrisma.assetPerShareYearly.findMany).toHaveBeenCalledTimes(1);
  });

  it('FII: trimestres, desdobramentos e múltiplos do banco', async () => {
    mockLeitor.obterLinhaQuadro.mockResolvedValue(
      linhaQuadroDb({ symbol: 'HGLG11', classe: 'fii', fiiTipo: 'tijolo', cnpj: '11728688000147' }),
    );
    mockLeitor.versaoQuadro.mockResolvedValue('v-teste-2');
    const e = entradaHglg();
    mockPrisma.fiiQuarterly.findMany.mockResolvedValue(
      e.trimestres.map((t) => ({
        ...t,
        refQuarter: new Date(`${t.refQuarter}T00:00:00Z`),
        receitaAluguel: t.receitaAluguel === null ? null : new Prisma.Decimal(t.receitaAluguel),
        resultadoTrimestral: new Prisma.Decimal(t.resultadoTrimestral ?? 0),
      })),
    );
    mockPrisma.assetPerShareYearly.findMany.mockResolvedValue(e.perShare);
    mockPrisma.assetMultiplesYearly.findMany.mockResolvedValue(e.multiplos);
    mockPrisma.assetMultiplesCurrent.findUnique.mockResolvedValue(e.atual);
    mockPrisma.fiiMonthly.findMany.mockResolvedValue([
      { refMonth: new Date('2018-04-01T00:00:00Z'), fatorDesdobramento: 10 },
    ]);
    const r = await obterFundamentosEssencial('HGLG11', HOJE);
    expect(r?.dados.variante).toBe('fii_tijolo');
    expect(valor(linha(r!.dados, '2017').valores.vpCota)).toBeCloseTo(112.727, 3);
  });
});

describe('hojeSaoPaulo', () => {
  it('data civil de São Paulo (UTC−3)', () => {
    expect(hojeSaoPaulo(new Date('2026-10-03T02:00:00Z'))).toBe('2026-10-02');
    expect(hojeSaoPaulo(new Date('2026-10-03T04:00:00Z'))).toBe('2026-10-03');
  });
});
