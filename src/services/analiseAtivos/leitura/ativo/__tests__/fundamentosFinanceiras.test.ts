/**
 * A6, fatia B — Essencial de banco e seguradora (templates) e a chave
 * ANALISE_ATIVOS_TEMPLATES_FINANCEIRAS_HABILITADO (desligada = resposta de hoje).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  assetPerShareYearly: { findMany: vi.fn() },
  assetMultiplesYearly: { findMany: vi.fn() },
  assetMultiplesCurrent: { findUnique: vi.fn() },
  assetFundamentalsSerie: { findMany: vi.fn() },
  analiseCasoDado: { findMany: vi.fn() },
}));
const mockLeitor = vi.hoisted(() => ({
  obterLinhaQuadro: vi.fn(),
  versaoQuadro: vi.fn(),
  obterCriteriaParamsQuadro: vi.fn(),
}));
const mockAcoes = vi.hoisted(() => ({ fundamentosVigentes: vi.fn() }));
const mockUniverso = vi.hoisted(() => ({ listarEmissores: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', () => mockLeitor);
vi.mock('@/services/analiseAtivos/repositorio/acoes', () => mockAcoes);
vi.mock('@/services/analiseAtivos/repositorio/universo', () => mockUniverso);

import {
  montarFundamentosAcao,
  obterFundamentosEssencial,
  type EntradaFundamentosAcao,
} from '../fundamentosEssencial';
import { TEXTOS_FINANCEIRAS } from '@/services/analiseAtivos/textosFinanceiras';
import {
  COLUNAS_ESSENCIAL_BANCO,
  COLUNAS_ESSENCIAL_SEGURADORA,
} from '@/types/analiseAtivosComplementos';
import { CRITERIA_PARAMS_V2 } from '@/services/analiseAtivos/params/criteriaParamsV2';
import { linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
import type { FundamentosPeriodo } from '@/services/analiseAtivos/tipos';
import type { Estado, FundamentosResposta } from '@/types/analiseAtivosApi';

const HOJE = '2026-10-19';
const bi = 1e9;
const TB = TEXTOS_FINANCEIRAS.banco;
const TS = TEXTOS_FINANCEIRAS.seguradora;

function periodo(ano: number, over: Partial<FundamentosPeriodo> = {}): FundamentosPeriodo {
  return {
    emissorId: '60872504000123',
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
    receita: 300 * bi,
    lucroBruto: null,
    ebit: null,
    depreciacaoAmortizacao: null,
    lucroLiquido: 40 * bi,
    lucroAtribuivel: 40 * bi,
    ativoTotal: 3_000 * bi,
    ativoCirculante: null,
    passivoCirculante: null,
    caixa: null,
    aplicacoesFinanceiras: null,
    dividaBrutaCp: null,
    dividaBrutaLp: null,
    pl: 210 * bi,
    plControladora: 200 * bi,
    fco: null,
    fci: null,
    fcf: null,
    capex: null,
    dividendosJcpPagos: 25 * bi,
    dmplDeclarado: null,
    lpaOn: null,
    lpaPn: null,
    naoSeAplica: ['ebit', 'depreciacaoAmortizacao'],
    flags: [],
    ...over,
  };
}

const ANOS = [2021, 2022, 2023, 2024, 2025];

function entradaBanco(over: Partial<EntradaFundamentosAcao> = {}): EntradaFundamentosAcao {
  return {
    hoje: HOJE,
    financeira: true,
    fys: ANOS.map((a) => periodo(a, { pdd: -(20 + a - 2021) * bi })),
    ttm: periodo(2026, {
      tipoPeriodo: 'TTM',
      dtIni: '2025-07-01',
      dtFim: '2026-06-30',
      pdd: -30 * bi,
      lucroAtribuivel: 45 * bi,
    }),
    perShare: ANOS.map((a) => ({
      anoFiscal: a,
      lpaAjHoje: 4,
      dpaAjHoje: 2,
      payoutDmplPct: 50,
    })),
    multiplos: ANOS.map((a) => ({
      anoFiscal: a,
      pl: 8,
      pvp: 1.6,
      dyPct: 6,
      roePct: 20,
      margemLiquidaPct: null,
      payoutPct: 50,
    })),
    atual: {
      pl: 9,
      pvp: 1.8,
      dy12mPct: 7,
      roePct: 21,
      margemLiquidaPct: null,
      payoutPct: 55,
      lpaTtm: 4.5,
      dpa12m: 2.5,
    },
    proventosEmConferencia: false,
    ...over,
  };
}

const valor = (e: Estado<number> | undefined) => (e?.estado === 'ok' ? e.valor : null);
const linha = (r: FundamentosResposta, rotulo: string) =>
  r.linhas.find((l) => l.rotulo === rotulo)!;

describe('Essencial · banco', () => {
  const r = montarFundamentosAcao({ ...entradaBanco(), template: 'banco' }, { layout: 'v24' });

  it('11 linhas do template + P/L e P/VP, com template e os rótulos de textosFinanceiras', () => {
    expect(r.template).toBe('banco');
    expect(r.colunas.map((c) => c.codigo)).toEqual([...COLUNAS_ESSENCIAL_BANCO]);
    expect(r.colunas.find((c) => c.codigo === 'pdd')?.tooltip).toBe(TB.tooltips.pdd);
    expect(r.colunas.find((c) => c.codigo === 'pddLucro')?.formato).toBe('multiplo');
  });

  it('PDD em valor absoluto (R$ bi), margem bancária e PDD ÷ lucro', () => {
    const l = linha(r, '2025');
    expect(valor(l.valores.pdd)).toBe(24);
    expect(valor(l.valores.receitaIntermediacao)).toBe(300);
    expect(valor(l.valores.margemBancaria)).toBeCloseTo(13.33, 2);
    expect(valor(l.valores.pddLucro)).toBeCloseTo(0.6, 4);
    expect(valor(l.valores.ativoTotal)).toBe(3000);
    expect(valor(l.valores.patrimonio)).toBe(200);
    expect(valor(l.valores.roe)).toBe(20);
    expect(valor(l.valores.pvp)).toBe(1.6);
    const u = linha(r, 'Últ. 12m');
    expect(valor(u.valores.pdd)).toBe(30);
    expect(valor(u.valores.pl)).toBe(9);
  });

  it('Basileia fora com a observação; nota de padrão contábil', () => {
    expect(r.observacoes).toContain(TB.observacoes.basileia);
    expect(r.observacoes[0]).toBe(TB.unidade);
    expect(r.colunas.some((c) => /basileia/i.test(c.rotulo))).toBe(false);
  });

  it('lucro ≤ 0 ⇒ PDD ÷ lucro "—" com o motivo (+ nota); sem DVA ⇒ PDD "—" sem DVA', () => {
    const e = entradaBanco();
    e.fys[4] = periodo(2025, { pdd: -10 * bi, lucroAtribuivel: -1 * bi, lucroLiquido: -1 * bi });
    e.fys[3] = periodo(2024);
    const rr = montarFundamentosAcao({ ...e, template: 'banco' }, { layout: 'v24' });
    expect(linha(rr, '2025').valores.pddLucro).toMatchObject({
      estado: 'ausente',
      texto: TB.motivos.lucroNaoPositivo,
    });
    expect(linha(rr, '2024').valores.pdd).toMatchObject({
      estado: 'ausente',
      texto: TB.motivos.semDva,
    });
    expect(rr.observacoes).toContain(TB.observacoes.pddLucro);
  });

  it('sem template ⇒ a resposta de hoje (sem a chave template, mesmas colunas)', () => {
    const e = entradaBanco();
    const hoje = montarFundamentosAcao(e, { layout: 'v24' });
    expect(montarFundamentosAcao({ ...e, template: null }, { layout: 'v24' })).toEqual(hoje);
    expect('template' in hoje).toBe(false);
    expect(hoje.colunas.map((c) => c.codigo)).toContain('ebitda');
  });

  it('layout legado (base do Raio-X) em R$ mi com as mesmas células', () => {
    const leg = montarFundamentosAcao({ ...entradaBanco(), template: 'banco' });
    expect(leg.unidade).toBe('R$ mi');
    expect(valor(linha(leg, '2025').valores.pdd)).toBe(24_000);
    expect(valor(linha(leg, '2025').valores.pddLucro)).toBeCloseTo(0.6, 4);
  });
});

describe('Essencial · seguradora', () => {
  const holding = (a: number) =>
    periodo(a, {
      emissorId: '17344597000194',
      receita: 0,
      receitaSeguro: 0,
      receitaComissoesServicos: 4 * bi,
      equivalenciaPatrimonial: 5 * bi,
      resultadoFinanceiro: 1 * bi,
      lucroAtribuivel: 9 * bi,
      lucroLiquido: 9 * bi,
      pl: 10 * bi,
      plControladora: 10 * bi,
    });
  const operacional = (a: number) =>
    periodo(a, {
      emissorId: '02149205000169',
      receita: 40 * bi,
      receitaSeguro: a >= 2023 ? 32 * bi : null,
      despesaSeguro: a >= 2023 ? -25 * bi : null,
      premiosGanhos: a <= 2022 ? 20 * bi : null,
      sinistrosRetidos: a <= 2022 ? -13 * bi : null,
      receitaComissoesServicos: 3 * bi,
      equivalenciaPatrimonial: 0.06 * bi,
      resultadoFinanceiro: 1.5 * bi,
      lucroAtribuivel: 3 * bi,
      lucroLiquido: 3 * bi,
    });

  it('holding (BBSE3): receita = comissões + serviços, equivalência aparece, margem sem leitura', () => {
    const r = montarFundamentosAcao(
      { ...entradaBanco({ fys: ANOS.map(holding), ttm: null }), template: 'seguradora' },
      { layout: 'v24' },
    );
    expect(r.template).toBe('seguradora');
    expect(r.colunas.map((c) => c.codigo)).toEqual([...COLUNAS_ESSENCIAL_SEGURADORA]);
    expect(r.colunas[0].tooltip).toBe(TS.tooltips.receita.comissoes_servicos);
    const l = linha(r, '2025');
    expect(valor(l.valores.receitaOperacional)).toBe(4);
    expect(valor(l.valores.equivalencia)).toBe(5);
    expect(l.valores.margemLiquida).toMatchObject({
      estado: 'ausente',
      texto: TS.motivos.margemSemLeitura,
    });
    expect(r.observacoes).toContain(TS.observacoes.holdings);
    expect(r.observacoes).toContain(TS.observacoes.margemHolding);
    expect(r.observacoes[0]).toContain(TS.receitaUsada.comissoes_servicos);
  });

  it('operacional (PSSA3): prêmios ganhos até 2022 e receita de seguro desde 2023; equivalência "—"', () => {
    const r = montarFundamentosAcao(
      { ...entradaBanco({ fys: ANOS.map(operacional), ttm: null }), template: 'seguradora' },
      { layout: 'v24' },
    );
    expect(valor(linha(r, '2022').valores.receitaOperacional)).toBe(20);
    expect(valor(linha(r, '2025').valores.receitaOperacional)).toBe(32);
    expect(linha(r, '2025').valores.equivalencia).toMatchObject({
      estado: 'ausente',
      texto: TS.motivos.equivalenciaNaoSeAplica,
    });
    expect(valor(linha(r, '2025').valores.margemLiquida)).toBeCloseTo(9.375, 3);
    expect(r.observacoes).toContain(TS.observacoes.equivalenciaOperacional);
    expect(r.observacoes[0]).toContain(TS.receitaUsada.premios_ganhos);
    expect(r.observacoes[0]).toContain(TS.receitaUsada.receita_seguro);
  });
});

describe('obterFundamentosEssencial · chave dos templates', () => {
  let antes: string | undefined;
  beforeEach(() => {
    antes = process.env.ANALISE_ATIVOS_TEMPLATES_FINANCEIRAS_HABILITADO;
    Object.values(mockPrisma).forEach((m) =>
      Object.values(m).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset()),
    );
    mockLeitor.obterCriteriaParamsQuadro.mockReset().mockResolvedValue(CRITERIA_PARAMS_V2);
    mockPrisma.assetFundamentalsSerie.findMany.mockResolvedValue([]);
    mockPrisma.analiseCasoDado.findMany.mockResolvedValue([]);
    mockUniverso.listarEmissores
      .mockReset()
      .mockResolvedValue([
        { cnpj: '60872504000123', ehBanco: true, ehFinanceira: true, segmento: 'Bancos' },
      ]);
    const e = entradaBanco();
    mockAcoes.fundamentosVigentes.mockReset().mockResolvedValue([...e.fys, e.ttm]);
    mockPrisma.assetPerShareYearly.findMany.mockResolvedValue(e.perShare);
    mockPrisma.assetMultiplesYearly.findMany.mockResolvedValue(e.multiplos);
    mockPrisma.assetMultiplesCurrent.findUnique.mockResolvedValue(e.atual);
    mockLeitor.obterLinhaQuadro.mockResolvedValue(
      linhaQuadroDb({ symbol: 'ITUB4', cnpj: '60872504000123', regua: 'acao_financeira' }),
    );
  });
  afterEach(() => {
    if (antes === undefined) delete process.env.ANALISE_ATIVOS_TEMPLATES_FINANCEIRAS_HABILITADO;
    else process.env.ANALISE_ATIVOS_TEMPLATES_FINANCEIRAS_HABILITADO = antes;
  });

  it('desligada ⇒ resposta idêntica à de hoje (sem template) e sem ler o segmento', async () => {
    delete process.env.ANALISE_ATIVOS_TEMPLATES_FINANCEIRAS_HABILITADO;
    mockLeitor.versaoQuadro.mockResolvedValue('v-fin-off');
    const r = await obterFundamentosEssencial('ITUB4', HOJE);
    expect(mockUniverso.listarEmissores).not.toHaveBeenCalled();
    expect(r!.dados.template).toBeUndefined();
    expect('template' in r!.dados).toBe(false);
    expect(r!.dados.colunas.map((c) => c.codigo)).toContain('ebitda');
    expect(mockAcoes.fundamentosVigentes).toHaveBeenCalledWith(mockPrisma, ['60872504000123'], {
      tipos: ['FY', 'TTM'],
      desde: '2014-01-01',
    });
  });

  it('ligada ⇒ template pelo segmento B3 do emissor', async () => {
    process.env.ANALISE_ATIVOS_TEMPLATES_FINANCEIRAS_HABILITADO = 'true';
    mockLeitor.versaoQuadro.mockResolvedValue('v-fin-on');
    const r = await obterFundamentosEssencial('ITUB4', HOJE);
    expect(r!.dados.template).toBe('banco');
    expect(r!.dados.colunas.map((c) => c.codigo)).toEqual([...COLUNAS_ESSENCIAL_BANCO]);
  });
});
