/**
 * fundamentei-regras (F2): Essencial, Raio-X e template de banco com ANALISE_ATIVOS_ESSENCIAL_V2
 * (opção `essencialV2` das funções puras) e o sub-rótulo do payout pela payout.regra vigente.
 * Chave desligada = resposta de hoje. Empresas SINTÉTICAS (números redondos; nenhum valor de
 * terceiros): uma com exercício mar–fev (como a CAML3) e um banco.
 */
import { describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import {
  montarFundamentosAcao,
  type EntradaFundamentosAcao,
} from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencial';
import { montarAcao } from '@/services/analiseAtivos/leitura/ativo/raioX';
import { montarDividendos } from '@/services/analiseAtivos/leitura/ativo/dividendosAnuais';
import {
  pddLucroPctDe,
  valoresBanco,
} from '@/services/analiseAtivos/regras/acoes/templateFinanceira';
import { formatarEstado } from '@/components/analiseAtivos/comum/formatarAnalise';
import { TEXTOS_ATIVO } from '@/services/analiseAtivos/textosAtivo';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import type { FundamentosPeriodo } from '@/services/analiseAtivos/tipos';
import type { FundamentosResposta } from '@/types/analiseAtivosApi';

const HOJE = '2026-10-20';
const MI = 1e6;
const V24 = { layout: 'v24' } as const;
const TX = TEXTOS_ATIVO.essencialV2;

function fy(ano: number, over: Partial<FundamentosPeriodo> = {}): FundamentosPeriodo {
  return {
    emissorId: 'C-SINT',
    docTipo: 'DFP',
    tipoPeriodo: 'FY',
    escopo: 'con',
    padraoContabil: 'IFRS',
    dtIni: `${ano - 1}-03-01`,
    dtFim: `${ano}-02-28`,
    anoFiscal: ano,
    trimestreFiscal: null,
    versao: 1,
    dtEntregaOriginal: `${ano}-05-20`,
    receita: 2000 * MI,
    lucroBruto: null,
    ebit: null,
    depreciacaoAmortizacao: null,
    lucroLiquido: 100 * MI,
    lucroAtribuivel: 100 * MI,
    ativoTotal: 5000 * MI,
    ativoCirculante: null,
    passivoCirculante: null,
    caixa: null,
    aplicacoesFinanceiras: null,
    dividaBrutaCp: null,
    dividaBrutaLp: null,
    pl: 1000 * MI,
    plControladora: 1000 * MI,
    fco: null,
    fci: null,
    fcf: null,
    capex: null,
    dividendosJcpPagos: 40 * MI,
    dmplDeclarado: 30 * MI,
    lpaOn: null,
    lpaPn: null,
    naoSeAplica: [],
    flags: [],
    ...over,
  };
}

const ANOS = [2022, 2023, 2024, 2025, 2026];

/** Exercício mar–fev; FY 2024 com prejuízo. */
function entrada(over: Partial<EntradaFundamentosAcao> = {}): EntradaFundamentosAcao {
  return {
    hoje: HOJE,
    financeira: false,
    fys: ANOS.map((a) =>
      fy(a, a === 2024 ? { lucroAtribuivel: -20 * MI, lucroLiquido: -20 * MI } : {}),
    ),
    ttm: null,
    perShare: ANOS.map((a) => ({
      anoFiscal: a,
      lpaAjHoje: a === 2024 ? -0.2 : 1,
      dpaAjHoje: 0.4,
      payoutDmplPct: a === 2024 ? -150 : 30,
    })),
    multiplos: ANOS.map((a) => ({
      anoFiscal: a,
      pl: a === 2024 ? null : 10,
      pvp: 1,
      dyPct: 4,
      roePct: 10,
      margemLiquidaPct: 5,
      payoutPct: a === 2024 ? null : 40,
    })),
    atual: null,
    proventosEmConferencia: false,
    ...over,
  };
}

const anos = (r: FundamentosResposta) => r.linhas.map((l) => l.ano);
const porAno = (r: FundamentosResposta, ano: number) => r.linhas.find((l) => l.ano === ano)!;

describe('Essencial — chave desligada = hoje', () => {
  it('sem opção, com essencialV2 false e com a regra dmpl_dpa: a mesma resposta', () => {
    const base = montarFundamentosAcao(entrada(), V24);
    expect(montarFundamentosAcao(entrada(), { ...V24, essencialV2: false })).toEqual(base);
    expect(montarFundamentosAcao(entrada(), { ...V24, regraPayout: 'dmpl_dpa' })).toEqual(base);
    // hoje: o FY de fev/2026 só entra em 2027; rótulos '2025'; sem 'L'
    expect(anos(base)).toEqual([2022, 2023, 2024, 2025]);
    expect(porAno(base, 2025).rotulo).toBe('2025');
    expect(porAno(base, 2025).dtFim).toBeUndefined();
    expect(porAno(base, 2024).valores.payout).not.toHaveProperty('rotuloCurto');
    expect(base.colunas.find((c) => c.codigo === 'lucro')?.rotulo).toBe(
      TEXTOS_ATIVO.essencial.colunas.lucro,
    );
  });
});

describe('Essencial — chave ligada', () => {
  const r = montarFundamentosAcao(entrada(), { ...V24, essencialV2: true });

  it("exercício fora de dezembro: o FY de fev/2026 aparece, rotulado 'fev/2026', com a nota", () => {
    expect(anos(r)).toEqual([2022, 2023, 2024, 2025, 2026]);
    expect(porAno(r, 2026).rotulo).toBe('fev/2026');
    expect(porAno(r, 2026).dtFim).toBe('2026-02-28');
    expect(porAno(r, 2026).ultimoAno).toBe(true);
    expect(r.observacoes.some((o) => o.includes('fevereiro'))).toBe(true);
  });

  it("um lucro líquido só: 'Lucro líquido' e 'Margem líquida', sem ⓘ de fallback", () => {
    const lucro = r.colunas.find((c) => c.codigo === 'lucro')!;
    const margem = r.colunas.find((c) => c.codigo === 'margem')!;
    expect(lucro.rotulo).toBe(TX.colunas.lucro);
    expect(margem.rotulo).toBe(TX.colunas.margem);
    expect(lucro.tooltip).toBe(TX.tooltips.lucro);
    expect(r.linhas.every((l) => !l.marcas)).toBe(true);
  });

  it("prejuízo no ano: payout e P/L com 'L' (tooltip 'prejuízo no período')", () => {
    const p = porAno(r, 2024).valores.payout;
    expect(p).toMatchObject({ estado: 'ausente', rotuloCurto: 'L', texto: TX.tooltipPrejuizo });
    expect(porAno(r, 2024).valores.pl).toMatchObject({ rotuloCurto: 'L' });
    expect(formatarEstado(p, 'pct')).toBe('L');
  });

  it('textos novos passam pela varredura de linguagem', () => {
    const textos = [
      ...Object.values(TX.colunas),
      ...Object.values(TX.tooltips),
      TX.tooltipPrejuizo,
      TX.notaExercicio,
      ...Object.values(TEXTOS_ATIVO.payoutRegra),
    ];
    for (const t of textos) expect(encontrarProibidasV2(t)).toEqual([]);
  });
});

describe('payout: o que ele mede segue a payout.regra vigente, nunca a chave', () => {
  it("'dfc' ⇒ tooltip 'proventos pagos (fluxo de caixa) ÷ lucro', com ou sem a chave", () => {
    for (const essencialV2 of [false, true]) {
      const r = montarFundamentosAcao(entrada(), { ...V24, essencialV2, regraPayout: 'dfc' });
      expect(r.colunas.find((c) => c.codigo === 'payout')?.tooltip).toBe(
        TEXTOS_ATIVO.payoutRegra.dfc,
      );
    }
  });

  it("'dmpl_dpa' ⇒ a coluna de hoje (sem tooltip)", () => {
    const r = montarFundamentosAcao(entrada(), {
      ...V24,
      essencialV2: true,
      regraPayout: 'dmpl_dpa',
    });
    expect(r.colunas.find((c) => c.codigo === 'payout')?.tooltip).toBeUndefined();
  });
});

describe('Raio-X da mesma entrada', () => {
  const dados = (e: EntradaFundamentosAcao) => ({
    financeira: false,
    periodos: e.fys,
    perShare: e.perShare.map((p) => ({ ...p, acoesFim: 100 * MI, flags: [] })),
    multiplos: e.multiplos.map((m) => ({
      ...m,
      roicPct: null,
      divLiqEbitda: null,
      divLiqPl: null,
      liquidezCorrente: null,
      flags: [],
    })),
    atual: null,
    flagsLinha: [],
    motivosLinha: [],
  });
  const payoutLinha = (r: ReturnType<typeof montarAcao>['raioX']) =>
    r.blocos.flatMap((b) => b.linhas).find((l) => l.codigo === 'payoutPct');

  it('chave desligada e dmpl_dpa: Raio-X de hoje (sem rotulosAnos, sub de hoje)', () => {
    const { raioX } = montarAcao(HOJE, dados(entrada()));
    expect(montarAcao(HOJE, dados(entrada()), { regraPayout: 'dmpl_dpa' }).raioX).toEqual(raioX);
    expect(raioX.rotulosAnos).toBeUndefined();
    expect(raioX.observacaoExercicio).toBeUndefined();
    expect(raioX.anos).not.toContain(2026);
    expect(payoutLinha(raioX)?.sub).toBe(TEXTOS_RAIO_X.linhas.payoutPct.sub);
  });

  it("chave ligada: 'fev/2026' no cabeçalho, nota do exercício e 'L' no payout com prejuízo", () => {
    const { raioX } = montarAcao(HOJE, dados(entrada()), { essencialV2: true });
    expect(raioX.anos[0]).toBe(2026);
    expect(raioX.rotulosAnos).toMatchObject({ 2026: 'fev/2026', 2025: 'fev/2025' });
    expect(raioX.observacaoExercicio).toContain('fevereiro');
    expect(raioX.observacoes).toContain(raioX.observacaoExercicio);
    expect(payoutLinha(raioX)?.valores[2024]).toMatchObject({ rotuloCurto: 'L' });
  });

  it("regra 'dfc': sub-rótulo do payout de caixa", () => {
    const { raioX } = montarAcao(HOJE, dados(entrada()), { regraPayout: 'dfc' });
    expect(payoutLinha(raioX)?.sub).toBe(TEXTOS_ATIVO.payoutRegra.dfc);
  });
});

describe('banco (template A6): PDD ÷ lucro em % com a chave', () => {
  const banco = (ano: number) =>
    fy(ano, {
      dtIni: `${ano}-01-01`,
      dtFim: `${ano}-12-31`,
      pdd: -50 * MI,
      receita: 900 * MI,
      lucroAtribuivel: 200 * MI,
      lucroLiquido: 200 * MI,
    });
  const e = (): EntradaFundamentosAcao => ({
    ...entrada(),
    financeira: true,
    fys: [2023, 2024, 2025].map(banco),
    perShare: [],
    multiplos: [2023, 2024, 2025].map((a) => ({
      anoFiscal: a,
      pl: 8,
      pvp: 1.5,
      dyPct: 6,
      roePct: 18,
      margemLiquidaPct: null,
      payoutPct: 45,
    })),
    template: 'banco',
  });

  it('pddLucroPctDe = a razão × 100; o motivo passa igual', () => {
    const b = valoresBanco(banco(2025), 200 * MI);
    expect(b.pddLucro).toEqual({ valor: 0.25 });
    expect(pddLucroPctDe(b)).toEqual({ valor: 25 });
    expect(pddLucroPctDe({ pddLucro: { motivo: 'sem_dva' } })).toEqual({ motivo: 'sem_dva' });
  });

  it('desligada: em × (formato multiplo); ligada: em % (formato pct, tooltip próprio)', () => {
    const off = montarFundamentosAcao(e(), V24);
    const on = montarFundamentosAcao(e(), { ...V24, essencialV2: true });
    const col = (r: FundamentosResposta) => r.colunas.find((c) => c.codigo === 'pddLucro')!;
    expect(col(off).formato).toBe('multiplo');
    expect(col(on).formato).toBe('pct');
    expect(col(on).tooltip).not.toBe(col(off).tooltip);
    expect(porAno(off, 2025).valores.pddLucro).toMatchObject({ estado: 'ok', valor: 0.25 });
    expect(porAno(on, 2025).valores.pddLucro).toMatchObject({ estado: 'ok', valor: 25 });
  });

  it('Raio-X do banco: linha PDD ÷ lucro em % com a chave', () => {
    const d = {
      financeira: true,
      periodos: e().fys,
      perShare: [],
      multiplos: e().multiplos.map((m) => ({
        ...m,
        roicPct: null,
        divLiqEbitda: null,
        divLiqPl: null,
        liquidezCorrente: null,
        flags: [],
      })),
      atual: null,
      flagsLinha: [],
      motivosLinha: [],
      template: 'banco' as const,
    };
    const linhaPdd = (v2: boolean) =>
      montarAcao(HOJE, d, v2 ? { essencialV2: true } : {})
        .raioX.blocos.flatMap((b) => b.linhas)
        .find((l) => l.codigo === 'pddLucro')!;
    expect(linhaPdd(false).formato).toBe('multiplo');
    expect(linhaPdd(true).formato).toBe('pct');
    expect(linhaPdd(true).valores[2025]).toMatchObject({ valor: 25 });
  });
});

describe('dividendos anuais (topo): exercício fora de dezembro', () => {
  const anosDiv = ANOS.map((a) => ({ ano: a, valor: 0.4, dtFim: `${a}-02-28` }));
  const base = {
    classe: 'acao' as const,
    hoje: HOJE,
    anos: anosDiv,
    ult12m: null,
    ult12mData: null,
  };

  it("'ano' (hoje) = sem critério; 'dtFim' traz o FY de fev/2026", () => {
    expect(montarDividendos({ ...base, criterio: 'ano' })).toEqual(montarDividendos(base));
    expect(montarDividendos(base).anos.map((a) => a.ano)).not.toContain(2026);
    expect(montarDividendos({ ...base, criterio: 'dtFim' }).anos.map((a) => a.ano)).toContain(2026);
  });
});
