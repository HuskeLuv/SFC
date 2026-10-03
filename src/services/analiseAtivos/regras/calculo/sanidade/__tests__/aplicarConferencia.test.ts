/**
 * Aplicação das conferências do bloco C ao Índice MF e ao semáforo (fatia A): escopo empresa × ticker,
 * troca de componente por ausente('em_conferencia') na forma da trava do DY, consistência Índice ⇔
 * motivo ⇔ flag, liberação e REGRESSÃO v1 (com a v1 a saída é idêntica, byte a byte).
 */
import { describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import fixture from './fixtures/dev-2026-10-03.json';
import {
  calcularAtualAcao,
  calcularAtualFii,
  comConferenciaDaEmpresa,
  comConferenciasDaEmpresa,
  scoreAcao,
  scoreFii,
  type CalculoAtualAcao,
  type EntradaAtualAcao,
  type EntradaAtualFii,
} from '@/services/analiseAtivos/calculo/recalcularScores';
import { marcarHistoricoForaDeEscala } from '@/services/analiseAtivos/calculo/recalcularDerivados';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { SCORING_PARAMS_V2 } from '@/services/analiseAtivos/params/scoringParamsV2';
import type { ComponentesIndice } from '@/services/analiseAtivos/regras/calculo/indiceMf';
import {
  aplicarConferenciaComponentes,
  aplicarConferenciaSemaforo,
  chaveLiberacaoDe,
  componentesEmConferencia,
  conferenciasDaEmpresa,
  contarRegras,
  regrasAcimaDoLimite,
} from '@/services/analiseAtivos/regras/calculo/sanidade/aplicarConferencia';
import type { PregaoSerie } from '@/services/analiseAtivos/regras/calculo/sanidade/precoBase';
import { componentesDoGrupo, flagsConf } from '@/services/analiseAtivos/regras/comum/conferencia';
import type { FundamentosPeriodo, TickerAcao } from '@/services/analiseAtivos/tipos';

const V1 = SCORING_PARAMS_V1;
const V2 = SCORING_PARAMS_V2;
const SBSP3_SERIE = (fixture.precos as unknown as Record<string, { serie: PregaoSerie[] }>).SBSP3
  .serie;

const FUND = {
  receita: 1e9,
  lucroLiquido: 2e8,
  lucroAtribuivel: 2e8,
  ebit: 3e8,
  depreciacaoAmortizacao: 5e7,
  ativoTotal: 3e9,
  ativoCirculante: 1e9,
  passivoCirculante: 5e8,
  caixa: 4e8,
  aplicacoesFinanceiras: 0,
  dividaBrutaCp: 1e8,
  dividaBrutaLp: 2e8,
  pl: 1e9,
  plControladora: 1e9,
  fco: 2.5e8,
  capex: 5e7,
  naoSeAplica: [],
  flags: [],
} as unknown as FundamentosPeriodo;

/** FY completo de 10 anos com lucro (Índice 'calculado' com P/L vs. média de 10 anos). */
const FYS = Array.from({ length: 10 }, (_, i) => ({
  ...FUND,
  emissorId: 'X',
  tipoPeriodo: 'FY',
  anoFiscal: 2016 + i,
  dtFim: `${2016 + i}-12-31`,
})) as unknown as FundamentosPeriodo[];
const HIST_PL = FYS.map((f) => ({ anoFiscal: f.anoFiscal, pl: 10, plNaoSeAplica: false }));

function ticker(symbol: string, classe: 'ON' | 'PN' = 'ON'): TickerAcao {
  return { symbol, cnpj: 'X', classeTitulo: classe, unitQtdOn: null, unitQtdPn: null };
}

function entradaAcao(
  symbol: string,
  o: {
    preco?: number;
    acoes?: number;
    pregoes21?: number;
    serie?: PregaoSerie[];
    liberacoes?: Set<string>;
    historicoPl?: EntradaAtualAcao['historicoPl'];
    classe?: 'ON' | 'PN';
  } = {},
): EntradaAtualAcao {
  const t = ticker(symbol, o.classe);
  const preco = o.preco ?? 40;
  return {
    ticker: t,
    resumo: {
      symbol,
      ultimoPregao: '2026-09-29',
      closeRaw: preco,
      volumeMedio21: 1e8,
      pregoesComNegocio21: o.pregoes21 ?? 21,
      baixaLiquidez: false,
      negociadoUltimos30: true,
    },
    tickersEmpresa: [t],
    resumosEmpresa: new Map([[symbol, preco]]),
    fundAtual: FUND,
    fys: FYS,
    contagens: [
      {
        cnpj: 'X',
        data: '2025-12-31',
        on: o.acoes ?? 1e8,
        pn: 0,
        total: o.acoes ?? 1e8,
        fonte: 'dfp',
        razaoLpa: 1,
        status: 'ok',
      },
    ],
    emissor: undefined,
    proventos: [],
    eventos: [],
    cobertura: 'EMPTY',
    historicoPl: o.historicoPl ?? HIST_PL,
    dataRef: '2026-09-29',
    sanidade: { serie: o.serie ?? [], liberacoes: o.liberacoes },
  };
}

const semSanidade = (e: EntradaAtualAcao): EntradaAtualAcao => {
  const { sanidade: _s, ...resto } = e;
  return resto;
};

describe('REGRESSÃO v1 (sanidade.conferencia.ligada=false): saída idêntica, byte a byte', () => {
  const casos: Array<[string, EntradaAtualAcao]> = [
    ['CBAV3-like (P/VP 0,0014)', entradaAcao('CBAV3', { preco: 11.22, acoes: 651_073 })],
    ['SBSP3 com a série real do salto', entradaAcao('SBSP3', { preco: 27.06, serie: SBSP3_SERIE })],
    ['esporádica fora da faixa', entradaAcao('XPTO3', { pregoes21: 2, preco: 0.5 })],
    [
      'histórico com ano marcado no banco',
      entradaAcao('POMO3', {
        historicoPl: HIST_PL.map((h, i) => (i < 3 ? { ...h, pl: 0.02, emConferencia: true } : h)),
      }),
    ],
  ];

  it.each(casos)(
    '%s: calcularAtualAcao e scoreAcao iguais com e sem a entrada do motor',
    (_n, e) => {
      const com = calcularAtualAcao(e, V1);
      const sem = calcularAtualAcao(semSanidade(e), V1);
      expect(JSON.stringify(com)).toBe(JSON.stringify(sem));
      expect(com.flags.some((f) => /^(conf|rev|info):/.test(f))).toBe(false);
      expect(com.conferenciasIndice).toBeUndefined();
      const mapa = new Map([[e.ticker.symbol, com]]);
      const s1 = scoreAcao(comConferenciasDaEmpresa(e.ticker.symbol, com, mapa), false, V1);
      const s0 = scoreAcao(comConferenciaDaEmpresa(sem, [sem]), false, V1);
      expect(JSON.stringify(s1)).toBe(JSON.stringify(s0));
    },
  );

  it('v1 ignora a flag de ano em conferência gravada no banco (o ponto continua na média)', () => {
    const e = entradaAcao('POMO3', {
      historicoPl: HIST_PL.map((h, i) => (i < 3 ? { ...h, pl: 0.02, emConferencia: true } : h)),
    });
    const v1 = calcularAtualAcao(e, V1);
    const v2 = calcularAtualAcao(e, V2);
    expect(v1.m.plPontosHistorico).toBe(10);
    expect(v2.m.plPontosHistorico).toBe(7);
    expect(v2.m.plMedia10a).toEqual({ estado: 'ok', valor: 10 });
  });

  it('FII: v1 idêntico com e sem a entrada do motor', () => {
    const e = entradaFii('APXU11', { obrigacoes: 125 });
    const { sanidade: _s, ...sem } = e;
    expect(JSON.stringify(calcularAtualFii(e, V1))).toBe(JSON.stringify(calcularAtualFii(sem, V1)));
  });
});

describe('v2: grupo bloqueado entra no Índice/semáforo como ausente(em_conferencia)', () => {
  it('CBAV3-like: conf:acoes_escala ⇒ C_preço em conferência, motivo preco:em_conferencia', () => {
    const c = calcularAtualAcao(entradaAcao('CBAV3', { preco: 11.22, acoes: 651_073 }), V2);
    expect(c.flags).toContain('conf:acoes_escala:pvp_minimo@2025-12-31');
    const s = scoreAcao(comConferenciasDaEmpresa('CBAV3', c, new Map([['CBAV3', c]])), false, V2);
    expect(s.indice.componentes.preco).toEqual({
      estado: 'ausente',
      nota: 0,
      motivo: 'em_conferencia',
    });
    expect(s.indice.incompleto).toBe(true);
    expect(s.indice.motivosIncompleto).toContain('preco:em_conferencia');
    expect(s.semaforo.checks.find((x) => x.codigo === 'preco_historico')).toMatchObject({
      status: 'sem_dado',
      motivo: 'em_conferencia',
    });
    // o valor bruto continua calculado (gravado na coluna)
    expect(c.m.pvp?.estado).toBe('ok');
  });

  it('SBSP3 (série real): preco_base ⇒ C_div e C_preço em conferência', () => {
    const c = calcularAtualAcao(entradaAcao('SBSP3', { preco: 27.06, serie: SBSP3_SERIE }), V2);
    expect(c.flags).toContain('conf:preco_base:base_sem_evento@2026-04-29');
    const s = scoreAcao(comConferenciasDaEmpresa('SBSP3', c, new Map([['SBSP3', c]])), false, V2);
    expect(s.indice.motivosIncompleto).toEqual(
      expect.arrayContaining(['div:em_conferencia', 'preco:em_conferencia']),
    );
  });

  it('liberação: mesma chave não marca (Índice volta a completo); chave nova marca', () => {
    const lib = new Set([chaveLiberacaoDe('CBAV3', 'pvp_minimo', '2025-12-31')]);
    const c = calcularAtualAcao(
      entradaAcao('CBAV3', { preco: 11.22, acoes: 651_073, liberacoes: lib }),
      V2,
    );
    expect(flagsConf(c.flags)).toEqual([]);
    const outra = new Set([chaveLiberacaoDe('CBAV3', 'pvp_minimo', '2024-12-31')]);
    const c2 = calcularAtualAcao(
      entradaAcao('CBAV3', { preco: 11.22, acoes: 651_073, liberacoes: outra }),
      V2,
    );
    expect(flagsConf(c2.flags)).toHaveLength(1);
  });

  it('empresa normal na v2: nenhuma flag conf:, Índice completo', () => {
    const c = calcularAtualAcao(entradaAcao('WEGE3'), V2);
    expect(flagsConf(c.flags)).toEqual([]);
    const s = scoreAcao(comConferenciasDaEmpresa('WEGE3', c, new Map([['WEGE3', c]])), false, V2);
    expect(s.indice.incompleto).toBe(false);
    expect(s.completoSemBlocoC).toBe(true);
  });
});

describe('escopo empresa × ticker', () => {
  const on = () => calcularAtualAcao(entradaAcao('ABCD3'), V2);
  const comFlag = (c: CalculoAtualAcao, flag: string): CalculoAtualAcao => ({
    ...c,
    flags: [...c.flags, flag],
  });

  it('PN esporádica (preco_esporadico, escopo ticker) com ON líquida ⇒ C_preço da ON fica ok', () => {
    const ref = on();
    const pn = comFlag(on(), 'conf:preco_esporadico:faixa_pvp@2026-09-29');
    const todos = new Map([
      ['ABCD3', ref],
      ['ABCD4', pn],
    ]);
    const c = comConferenciasDaEmpresa('ABCD3', ref, todos);
    expect(c.conferenciasIndice).toBeUndefined();
    const s = scoreAcao(c, false, V2);
    expect(s.indice.componentes.preco.estado).toBe('calculado');
    expect(s.indice.incompleto).toBe(false);
  });

  it('acoes_escala na PN (escopo empresa) ⇒ a ON fica incompleta', () => {
    const ref = on();
    const pn = comFlag(on(), 'conf:acoes_escala:pvp_minimo@2025-12-31');
    const todos = new Map([
      ['ABCD3', ref],
      ['ABCD4', pn],
    ]);
    const s = scoreAcao(comConferenciasDaEmpresa('ABCD3', ref, todos), false, V2);
    expect(s.indice.motivosIncompleto).toContain('preco:em_conferencia');
    expect(s.completoSemBlocoC).toBe(true);
  });

  it('preco_base no PRÓPRIO ticker de referência contamina o Índice da empresa', () => {
    expect(
      conferenciasDaEmpresa('ABCD3', [
        ['ABCD4', ['conf:preco_base:base_sem_evento@2026-04-29']],
        ['ABCD3', ['conf:preco_base:base_sem_evento@2026-04-29']],
      ]),
    ).toEqual([
      { grupo: 'preco_base', regra: 'base_sem_evento', chave: '2026-04-29', symbol: 'ABCD3' },
    ]);
  });

  it('proventos (legado) e historico (ponto anual) não entram por este caminho', () => {
    expect(
      conferenciasDaEmpresa('ABCD3', [
        ['ABCD3', ['conf:proventos:dy_acima_teto@2026-09-29', 'conf:historico:escala_ano@2017']],
      ]),
    ).toEqual([]);
  });
});

describe('componentes e semáforo', () => {
  const comps: ComponentesIndice = {
    lucro: { estado: 'calculado', nota: 10, metrica: 10 },
    divida: { estado: 'calculado', nota: 8, metrica: 1 },
    rent: { estado: 'calculado', nota: 6, metrica: 15 },
    div: { estado: 'calculado', nota: 5, metrica: 4 },
    preco: { estado: 'zero_regra', nota: 0, motivo: 'prejuizo' },
  };
  const metricasAcao = {
    lucro: 'anosLucroConsecutivos',
    divida: 'divLiqEbitda',
    rent: 'roePct',
    div: 'dy12mPct',
    preco: 'plVsMedia10aPct',
  };

  it('zero_regra (prejuízo) fica: zero é zero; calculado vira em conferência', () => {
    const afetados = componentesEmConferencia(
      [{ grupo: 'preco_base', regra: 'base_sem_evento' }],
      'acao',
      metricasAcao,
    );
    expect([...afetados.keys()]).toEqual(['div', 'preco']);
    const out = aplicarConferenciaComponentes(comps, afetados);
    expect(out.div).toEqual({ estado: 'ausente', nota: 0, motivo: 'em_conferencia' });
    expect(out.preco).toBe(comps.preco);
    expect(out.lucro).toBe(comps.lucro);
  });

  it('fii_obrigacoes: tijolo (C_dívida = Obrigações/PL) entra; papel (concentração de CRI) não', () => {
    const g = [{ grupo: 'fii_obrigacoes' as const, regra: 'obrigacoes_acima' }];
    const tijolo = Object.fromEntries(
      Object.entries(V2.fii.tijolo.componentes).map(([k, v]) => [k, v.metrica]),
    );
    const papel = Object.fromEntries(
      Object.entries(V2.fii.papel.componentes).map(([k, v]) => [k, v.metrica]),
    );
    expect([...componentesEmConferencia(g, 'fii', tijolo).keys()]).toEqual(['divida']);
    expect([...componentesEmConferencia(g, 'fii', papel).keys()]).toEqual([]);
  });

  it('todo grupo com componente na classe mapeia para métricas do ScoringParams', () => {
    for (const grupo of [
      'acoes_escala',
      'preco_base',
      'preco_esporadico',
      'fundamentos_escala',
    ] as const) {
      const afetados = componentesEmConferencia([{ grupo, regra: 'x' }], 'acao', metricasAcao);
      expect([...afetados.keys()].sort()).toEqual([...componentesDoGrupo(grupo, 'acao')].sort());
    }
  });

  it('semáforo: critério da métrica do grupo vira sem_dado(em_conferencia); n/a e não-atende por regra ficam', () => {
    const sem = {
      checks: [
        { codigo: 'preco_historico', status: 'atende' as const, valor: -10, referencia: 0 },
        {
          codigo: 'dividendos',
          status: 'nao_atende' as const,
          valor: null,
          referencia: 4,
          motivo: 'pl_negativo',
        },
        { codigo: 'rentabilidade', status: 'atende' as const, valor: 20, referencia: 15 },
      ],
      aplicaveis: 3,
      atendidos: 2,
    };
    const metricas = new Map([
      ['preco_historico', 'plVsMedia10aPct'],
      ['dividendos', 'dy12mPct'],
      ['rentabilidade', 'roePct'],
    ]);
    const out = aplicarConferenciaSemaforo(sem, [{ grupo: 'preco_base' }], metricas);
    expect(out.checks[0]).toMatchObject({
      status: 'sem_dado',
      valor: null,
      motivo: 'em_conferencia',
    });
    expect(out.checks[1]).toBe(sem.checks[1]);
    expect(out.checks[2]).toBe(sem.checks[2]);
    expect(out.atendidos).toBe(1);
    expect(aplicarConferenciaSemaforo(sem, [], metricas)).toBe(sem);
  });
});

function entradaFii(
  symbol: string,
  o: { obrigacoes?: number; regua?: 'fii_tijolo' | 'fii_papel'; vp?: [number, number] } = {},
): EntradaAtualFii {
  const [vpAtual, vpAnterior] = o.vp ?? [100, 100];
  const mes = (refMonth: string, vpCota: number) => ({
    cnpj: symbol,
    refMonth,
    vpCota,
    pl: 1e8,
    cotas: 1e6,
    obrigacoesPlPct: o.obrigacoes ?? 5,
    fatorDesdobramento: null,
    tipoVigente: o.regua === 'fii_papel' ? ('papel' as const) : ('tijolo' as const),
    reguaVigente: o.regua ?? ('fii_tijolo' as const),
  });
  const meses = [mes('2026-08-01', vpAtual), mes('2026-07-01', vpAnterior)];
  return {
    resumo: {
      symbol,
      ultimoPregao: '2026-09-29',
      closeRaw: 100,
      volumeMedio21: 1e6,
      pregoesComNegocio21: 21,
      baixaLiquidez: false,
      negociadoUltimos30: true,
    },
    mesAtual: meses[0],
    trimestre: null,
    proventos: [],
    eventos: [],
    cobertura: 'EMPTY',
    dataRef: '2026-09-29',
    sanidade: { symbol, meses, serie: [] },
  };
}

describe('FII (o FII é o próprio ticker)', () => {
  it('APXU11-like (Obrigações/PL 125%) tijolo ⇒ C_dívida em conferência, valor visível', () => {
    const e = entradaFii('APXU11', { obrigacoes: 125 });
    const c = calcularAtualFii(e, V2);
    expect(c.flags).toContain('conf:fii_obrigacoes:obrigacoes_acima@2026-08');
    expect(c.m.obrigacoesPlPct).toEqual({ estado: 'ok', valor: 125 });
    const s = scoreFii(c, e, V2);
    expect(s.indice.motivosIncompleto).toContain('divida:em_conferencia');
    expect(s.semaforo.checks.find((x) => x.codigo === 'obrigacoes_pl')).toMatchObject({
      status: 'sem_dado',
      motivo: 'em_conferencia',
    });
  });

  it('GSRF11-like (VP/cota ×6,23) ⇒ C_preço (P/VP) em conferência', () => {
    const e = entradaFii('GSRF11', { vp: [87.62, 14.07] });
    const c = calcularAtualFii(e, V2);
    expect(c.flags).toContain('conf:fii_vp:vp_salto@2026-08');
    expect(scoreFii(c, e, V2).indice.motivosIncompleto).toContain('preco:em_conferencia');
  });

  it('FII normal ⇒ nenhuma flag e Índice completo', () => {
    const e = entradaFii('RECT11');
    const c = calcularAtualFii(e, V2);
    expect(c.flags.filter((f) => f.startsWith('conf:'))).toEqual([]);
    expect(scoreFii(c, e, V2).indice.incompleto).toBe(false);
  });
});

describe('consistência: Índice incompleto ⇔ motivo <comp>:em_conferencia ⇔ flag conf: com componente', () => {
  const flagsPorGrupo = [
    'conf:acoes_escala:pvp_minimo@2025-12-31',
    'conf:preco_base:base_sem_evento@2026-04-29',
    'conf:preco_esporadico:faixa_pvp@2026-09-29',
    'conf:fundamentos_escala:salto_escala@2025',
  ];
  it.each([[null], ...flagsPorGrupo.map((f) => [f])])('flag %s', (flag) => {
    const base = calcularAtualAcao(entradaAcao('ABCD3'), V2);
    const c = flag ? { ...base, flags: [...base.flags, flag] } : base;
    const s = scoreAcao(comConferenciasDaEmpresa('ABCD3', c, new Map([['ABCD3', c]])), false, V2);
    const motivosConf = s.indice.motivosIncompleto.filter((m) => m.endsWith(':em_conferencia'));
    const comps = flag ? componentesDoGrupo(flagsConf([flag])[0].grupo, 'acao') : [];
    expect(s.indice.incompleto).toBe(comps.length > 0);
    expect(motivosConf.sort()).toEqual(comps.map((x) => `${x}:em_conferencia`).sort());
  });
});

describe('R2 nos derivados: ponto anual marcado e liberação por ano', () => {
  const pomo = (
    fixture.historico as unknown as Record<string, Array<Record<string, number | null>>>
  ).POMO3;
  const linhas = () =>
    pomo.map(
      (p) =>
        ({
          symbol: 'POMO3',
          cnpj: 'X',
          classe: 'acao',
          anoFiscal: p.anoFiscal,
          dtFim: new Date(`${p.anoFiscal}-12-31`),
          pl: p.pl,
          pvp: p.pvp,
          pReceita: p.pReceita,
          naoSeAplica: [],
          flags: [],
          paramsVersion: 2,
          calculadoEm: new Date(0),
        }) as unknown as Prisma.AssetMultiplesYearlyCreateManyInput,
    );

  it('POMO3: 2015–19 ganham conf:historico:escala_ano@<ano>; 2017 liberado não', () => {
    const ls = linhas();
    marcarHistoricoForaDeEscala(ls, V2, new Set([chaveLiberacaoDe('POMO3', 'escala_ano', '2017')]));
    const marcados = ls.filter((l) => (l.flags as string[]).length > 0).map((l) => l.anoFiscal);
    expect(marcados).toEqual([2015, 2016, 2018, 2019]);
    expect(ls.find((l) => l.anoFiscal === 2015)?.flags).toEqual(['conf:historico:escala_ano@2015']);
  });
});

describe('relatório por regra', () => {
  it('conta por regra, classe e empresa; alerta acima do limite', () => {
    const regras = contarRegras([
      {
        symbol: 'A3',
        cnpj: 'a',
        classe: 'acao',
        flags: ['conf:acoes_escala:pvp_minimo@x', 'rev:variacao_lucro@2025'],
      },
      { symbol: 'A4', cnpj: 'a', classe: 'acao', flags: ['conf:acoes_escala:pvp_minimo@x'] },
      {
        symbol: 'F11',
        classe: 'fii',
        flags: ['info:cotacao_esporadica', 'conf:fii_vp:vp_salto@2026-08'],
      },
    ]);
    expect(regras.map((r) => [r.regra, r.classe, r.acao, r.fii, r.empresas])).toEqual([
      ['conf:acoes_escala:pvp_minimo', 'conferencia', 2, 0, 1],
      ['conf:fii_vp:vp_salto', 'conferencia', 0, 1, 0],
      ['rev:variacao_lucro', 'revisao', 1, 0, 1],
      ['info:cotacao_esporadica', 'info', 0, 1, 0],
    ]);
    expect(regrasAcimaDoLimite(regras, { acao: 10, fii: 100 }, 3)).toEqual([
      { regra: 'conf:acoes_escala:pvp_minimo', classe: 'acao', n: 2, pct: 20 },
    ]);
  });
});
