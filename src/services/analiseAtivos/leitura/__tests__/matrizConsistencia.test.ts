/**
 * Matriz de consistência do "em conferência" (bloco C, fatia B): para cada grupo × classe ×
 * exibição, a MESMA linha (flags 'conf:') marca os MESMOS campos, com o MESMO texto, no Quadro, nos
 * KPIs, nos fundamentos, no valuation (cartão e barra), no semáforo, no Índice, nos dividendos e no
 * gráfico — tudo lido de conferenciasAtivo (que lê regras/comum/conferencia.ts).
 *
 * Também a regressão obrigatória: com a v1 (sem 'conf:') nada muda — legado de proventos continua
 * "valor + selo", sem `conferencias`, sem chip, sem frescor por bloco.
 */
import { describe, expect, it, vi } from 'vitest';
import { Prisma, type AnaliseQuadroLinha } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import {
  CAMPO_COLUNA_FUNDAMENTOS,
  componentesEmConferencia,
  conferenciaDaLinha,
  conferenciaDoCampo,
  criteriosEmConferencia,
  ehEstadoEmConferencia,
  montarConferenciasTela,
  PREFIXO_MOTIVO_CONFERENCIA,
} from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import { montarKpis } from '@/services/analiseAtivos/leitura/ativo/kpisAtivo';
import { montarSemaforoTela } from '@/services/analiseAtivos/leitura/ativo/semaforoTela';
import { montarDividendos } from '@/services/analiseAtivos/leitura/ativo/dividendosAnuais';
import {
  montarFundamentosAcao,
  montarFundamentosFii,
} from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencial';
import {
  montarValuation,
  type AnualValuation,
  type AtualValuation,
  type DadosAtivoValuation,
} from '@/services/analiseAtivos/leitura/ativo/valuationMultiplos';
import { indiceDesde } from '@/components/analiseAtivos/ativo/topo/GraficoLucroCotacao';
import {
  DEF_GRUPO,
  GRUPOS_CONFERENCIA,
  componentesDoGrupo,
  ehCampoTela,
  formatarFlagConf,
  gruposConf,
  type CampoTela,
  type ClasseConferencia,
  type GrupoConferencia,
} from '@/services/analiseAtivos/regras/comum/conferencia';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { encontrarPalavrasProibidas } from '@/services/analiseAtivos/textos';
import { LINHAS_FIXTURE, linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
import type { FundamentosPeriodo } from '@/services/analiseAtivos/tipos';
import type { Estado, LinhaQuadroApi } from '@/types/analiseAtivosApi';

const HOJE = '2026-10-02';
const TC = TEXTOS_TELA.conferencia;
const TV = TEXTOS_TELA.analise.valuation;

const REGRA: Record<GrupoConferencia, string> = {
  proventos: 'dy_acima_teto',
  acoes_escala: 'pvp_minimo',
  preco_base: 'base_sem_evento',
  preco_esporadico: 'faixa_pvp',
  fundamentos_escala: 'salto_escala',
  historico: 'escala_ano',
  fii_vp: 'vp_salto',
  fii_obrigacoes: 'obrigacoes_acima',
};
const CHAVE = (g: GrupoConferencia) =>
  g === 'historico' || g === 'fundamentos_escala' ? '2025' : '2026-04-29';
const flagDe = (g: GrupoConferencia) =>
  formatarFlagConf({ grupo: g, regra: REGRA[g], chave: CHAVE(g) });

// ---------------------------------------------------------------------------
// Linhas de teste (uma ação, um FII) com todos os campos do Quadro preenchidos
// ---------------------------------------------------------------------------

function linhaAcao(over: Partial<AnaliseQuadroLinha> = {}): AnaliseQuadroLinha {
  return linhaQuadroDb({
    symbol: 'TEST3',
    classe: 'acao',
    regua: 'acao',
    roePct: 20,
    pl: 10,
    pvp: 2,
    dy12mPct: 5,
    margemLiquidaPct: 15,
    divLiqEbitda: 1.2,
    payoutPct: 50,
    valorMercado: new Prisma.Decimal('10000000000'),
    paramsVersion: 2,
    ...over,
  });
}

function linhaFii(over: Partial<AnaliseQuadroLinha> = {}): AnaliseQuadroLinha {
  return linhaQuadroDb({
    symbol: 'TEST11',
    classe: 'fii',
    regua: 'fii_tijolo',
    fiiTipo: 'tijolo',
    pvp: 0.95,
    dy12mPct: 9,
    vacanciaFisicaCvmPct: 5,
    obrigacoesPlPct: 20,
    patrimonio: new Prisma.Decimal('1000000000'),
    cotistas: 100000,
    paramsVersion: 2,
    ...over,
  });
}

const linhaDe = (classe: ClasseConferencia, over: Partial<AnaliseQuadroLinha> = {}) =>
  classe === 'acao' ? linhaAcao(over) : linhaFii(over);

/** Campos com Estado no Quadro, por classe (LinhaQuadroApi). */
const CAMPOS_QUADRO: Record<ClasseConferencia, CampoTela[]> = {
  acao: ['roe', 'pl', 'pvp', 'dy12m', 'margemLiquida', 'divLiqEbitda', 'payout'],
  fii: ['pvp', 'dy12m', 'vacanciaCvm', 'obrigacoesPl'],
};

const BRUTOS: Record<ClasseConferencia, Record<string, number>> = {
  acao: { pl: 10, pvp: 2, dy12m: 5, roe: 20, margemLiquida: 15, divLiqEbitda: 1.2, payout: 50 },
  fii: { pvp: 0.95, dy12m: 9, vacanciaCvm: 5, obrigacoesPl: 20 },
};

function kpisDe(api: LinhaQuadroApi, classe: ClasseConferencia) {
  return montarKpis({
    linha: api,
    atuais: { plMedia10a: 9, plPontosHistorico: 8, dpa12m: 1, rend12m: 0.9, vpCota: 100 },
    pares: [],
    motivosIncompleto: [],
    brutos: BRUTOS[classe],
  });
}

// ---------------------------------------------------------------------------
// Valuation (dados mínimos de 12 meses + 10 anos)
// ---------------------------------------------------------------------------

const ANOS = Array.from({ length: 12 }, (_, i) => 2014 + i);

function atualVal(classe: ClasseConferencia): AtualValuation {
  const base: AtualValuation = {
    lpaTtm: 1.5,
    vpa: 5,
    dpa12m: 0.5,
    rend12m: null,
    vpCota: null,
    pl: 10,
    pvp: 2,
    pReceita: 1.5,
    evEbitda: 8,
    pFco: 9,
    pFcl: 12,
    dy12mPct: 5,
    payoutPct: 50,
    margemLiquidaPct: 15,
    roePct: 20,
    roaPct: 8,
    roicPct: 14,
    divLiqEbitda: 1.2,
    divLiqPl: 0.4,
    liquidezCorrente: 1.5,
    obrigacoesPlPct: null,
    naoSeAplica: [],
  };
  return classe === 'acao'
    ? base
    : { ...base, vpCota: 100, rend12m: 9, pvp: 0.95, dy12mPct: 9, obrigacoesPlPct: 20 };
}

function anualVal(ano: number, i: number, classe: ClasseConferencia): AnualValuation {
  return {
    anoFiscal: ano,
    pl: 8 + i,
    pvp: 1.5 + i / 10,
    pReceita: 1 + i / 10,
    evEbitda: 7 + i / 2,
    pFco: 8 + i,
    pFcl: 10 + i,
    dyPct: 5,
    payoutPct: 50,
    margemLiquidaPct: 14,
    roePct: 18,
    roaPct: 8,
    roicPct: 12,
    divLiqEbitda: 1,
    divLiqPl: 0.3,
    liquidezCorrente: 1.4,
    vpCota: classe === 'fii' ? 95 + i : null,
    rendCota12m: classe === 'fii' ? 8.5 : null,
    obrigacoesPlPct: classe === 'fii' ? 15 + i : null,
    vacanciaFisicaCvmPct: classe === 'fii' ? 5 : null,
  };
}

function valuationDe(api: LinhaQuadroApi, classe: ClasseConferencia) {
  const alvo: DadosAtivoValuation = {
    linha: api,
    regua: classe === 'acao' ? 'acao' : 'fii_tijolo',
    atual: atualVal(classe),
    anuais: ANOS.map((a, i) => anualVal(a, i, classe)),
    perShare: ANOS.map((a, i) => ({
      anoFiscal: a,
      lpaAjHoje: 1 + i / 10,
      vpaAjHoje: 4 + i / 10,
      dpaAjHoje: 0.5,
      payoutDmplPct: 50,
      rendCota: classe === 'fii' ? 8.5 : null,
      vpCotaFim: classe === 'fii' ? 95 + i : null,
    })),
    fys: ANOS.map((a, i) => ({
      anoFiscal: a,
      receita: 1e9 * (1 + i / 10),
      lucro: 1e8 * (1 + i / 10),
    })),
    mensal: [],
  };
  return montarValuation({ hoje: HOJE, alvo, pares: [], criterioPares: '' });
}

// ---------------------------------------------------------------------------
// Fundamentos (dados mínimos)
// ---------------------------------------------------------------------------

function periodo(ano: number, over: Partial<FundamentosPeriodo> = {}): FundamentosPeriodo {
  return {
    emissorId: '00000000000000',
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
    receita: 1e9,
    lucroBruto: null,
    ebit: null,
    depreciacaoAmortizacao: null,
    lucroLiquido: 1e8,
    lucroAtribuivel: 1e8,
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

function fundamentosDe(classe: ClasseConferencia, flags: string[]) {
  const conferencia = { flags, motivos: [] as string[] };
  if (classe === 'acao') {
    return montarFundamentosAcao({
      hoje: HOJE,
      financeira: false,
      fys: ANOS.map((a) => periodo(a)),
      ttm: periodo(2026, { tipoPeriodo: 'TTM', dtIni: '2025-07-01', dtFim: '2026-06-30' }),
      perShare: ANOS.map((a) => ({
        anoFiscal: a,
        lpaAjHoje: 1,
        dpaAjHoje: 0.5,
        payoutDmplPct: 50,
      })),
      multiplos: ANOS.map((a) => ({
        anoFiscal: a,
        pl: 10,
        pvp: 2,
        dyPct: 5,
        roePct: 20,
        margemLiquidaPct: 15,
        payoutPct: 50,
      })),
      atual: {
        pl: 10,
        pvp: 2,
        dy12mPct: 5,
        roePct: 20,
        margemLiquidaPct: 15,
        payoutPct: 50,
        lpaTtm: 1,
        dpa12m: 0.5,
      },
      proventosEmConferencia: false,
      conferencia,
    });
  }
  const tri = (ref: string) => ({
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
  });
  return montarFundamentosFii({
    hoje: HOJE,
    fiiTipo: 'tijolo',
    trimestres: [
      ...[2022, 2023, 2024, 2025].flatMap((a) =>
        ['03-31', '06-30', '09-30', '12-31'].map((md) => tri(`${a}-${md}`)),
      ),
      tri('2026-03-31'),
      tri('2026-06-30'),
    ],
    perShare: [2022, 2023, 2024, 2025].map((a) => ({ anoFiscal: a, rendCota: 9, vpCotaFim: 100 })),
    multiplos: [2022, 2023, 2024, 2025].map((a) => ({
      anoFiscal: a,
      pvp: 1,
      dyPct: 9,
      vacanciaFisicaCvmPct: 5,
      nImoveisCvm: 21,
    })),
    atual: { pvp: 0.95, dy12mPct: 9, vpCota: 100, rend12m: 9 },
    desdobramentos: [],
    proventosEmConferencia: false,
    conferencia,
  });
}

/** Checks do semáforo (todos 'atende') por classe. */
const CHECKS = {
  acao: ['lucros_consecutivos', 'endividamento', 'rentabilidade', 'preco_historico', 'dividendos'],
  fii: ['renda_recorrente', 'vacancia', 'obrigacoes_pl', 'preco_vp', 'dividendos'],
} as const;

function semaforoDe(classe: ClasseConferencia, flags: string[]) {
  return montarSemaforoTela(
    CHECKS[classe].map((codigo) => ({
      codigo,
      status: 'atende' as const,
      valor: 1,
      referencia: 1,
    })),
    gruposConf(flags),
  );
}

const ehOculto = (e: Estado<number>, g: GrupoConferencia) =>
  e.estado === 'ausente' && e.motivo === `${PREFIXO_MOTIVO_CONFERENCIA}${g}`;

// ---------------------------------------------------------------------------
// A matriz
// ---------------------------------------------------------------------------

const CASOS = GRUPOS_CONFERENCIA.flatMap((g) =>
  DEF_GRUPO[g].classes.map((classe) => ({ g, classe })),
);

describe.each(CASOS)('matriz: grupo $g × classe $classe', ({ g, classe }) => {
  const flags = [flagDe(g)];
  const row = linhaDe(classe, { flags });
  const api = paraLinhaQuadroApi(row);
  const base = paraLinhaQuadroApi(linhaDe(classe));
  const def = DEF_GRUPO[g];

  it('Quadro: "ocultar" = ausente sem número (fim da ordenação); "selo" = valor; resto igual', () => {
    for (const campo of CAMPOS_QUADRO[classe]) {
      const exib = def.campos[campo] ?? null;
      const e = api[campo as keyof LinhaQuadroApi] as Estado<number>;
      const b = base[campo as keyof LinhaQuadroApi] as Estado<number>;
      if (exib === 'ocultar') {
        expect(ehOculto(e, g)).toBe(true);
        expect(e.estado === 'ausente' && e.texto).toBe(TC.motivosPorGrupo[g]);
        // o Quadro nunca envia o número calculado
        expect(e.estado === 'ausente' && e.valorNaoPublicado).toBeUndefined();
      } else {
        expect(e).toEqual(b);
      }
      expect(conferenciaDaLinha(api, campo)?.exibicao ?? null).toBe(exib);
    }
    // valor de mercado depende do nº de ações / da cotação
    if (classe === 'acao') {
      expect(api.valorMercado === null).toBe(def.campos.valorMercado === 'ocultar');
    }
    expect(api.conferencias).toEqual([g]);
  });

  it('KPIs: os mesmos campos, o mesmo estado e o mesmo texto do Quadro', () => {
    const kpis = kpisDe(api, classe);
    for (const k of kpis) {
      const exib = ehCampoTela(k.codigo) ? (def.campos[k.codigo] ?? null) : null;
      if (!exib || k.valor.estado === 'nao_se_aplica') {
        expect(k.selo).not.toBe('em_conferencia');
        continue;
      }
      expect(k.selo).toBe('em_conferencia');
      if (exib === 'ocultar') {
        expect(ehOculto(k.valor, g)).toBe(true);
        expect(k.valor.estado === 'ausente' && k.valor.texto).toBe(TC.motivosPorGrupo[g]);
        expect(k.sub).toBeNull();
        const bruto = BRUTOS[classe][k.codigo];
        if (bruto !== undefined) {
          expect(k.valor.estado === 'ausente' && k.valor.valorNaoPublicado).toBe(bruto);
        }
      } else {
        expect(k.valor.estado).toBe('ok');
      }
      // mesmo estado do Quadro (sem o número não publicado)
      const q = api[k.codigo as keyof LinhaQuadroApi] as Estado<number> | undefined;
      if (q && typeof q === 'object' && 'estado' in q && k.codigo !== 'pvp') {
        expect(q.estado).toBe(k.valor.estado);
      }
    }
  });

  it('Valuation: cartão com a política do grupo e a barra oculta', () => {
    const v = valuationDe(api, classe);
    for (const item of v.grupos.flatMap((gr) => gr.itens)) {
      const exib = ehCampoTela(item.codigo) ? (def.campos[item.codigo] ?? null) : null;
      if (!exib) {
        expect(ehEstadoEmConferencia(item.atual)).toBe(false);
        continue;
      }
      if (exib === 'ocultar') {
        expect(ehOculto(item.atual, g)).toBe(true);
        expect(item.atual.estado === 'ausente' && item.atual.texto).toBe(TC.motivosPorGrupo[g]);
        expect(item.atual.estado === 'ausente' && typeof item.atual.valorNaoPublicado).toBe(
          'number',
        );
      } else {
        expect(item.atual.estado).toBe('ok');
      }
      if (item.barra.statusTexto !== '') {
        expect(item.barra.visivel).toBe(false);
        expect(item.barra.statusTexto).toBe(TV.barraConferencia);
      }
    }
  });

  it('Fundamentos: as mesmas células na linha certa (Últ. 12m e/ou o ano da chave)', () => {
    const f = fundamentosDe(classe, flags);
    const mapa = CAMPO_COLUNA_FUNDAMENTOS[classe];
    // histórico: só o ano; escala dos demonstrativos: o ano e os números de 12 meses
    for (const l of f.linhas) {
      const alvo =
        g === 'historico'
          ? l.ano === 2025
          : g === 'fundamentos_escala'
            ? l.ano === 2025 || l.ano === null
            : l.ano === null;
      for (const [coluna, valor] of Object.entries(l.valores)) {
        const campo =
          g === 'historico' && l.ano !== null
            ? ({ pl: 'historicoPl', pvp: 'historicoPvp' } as Record<string, CampoTela>)[coluna]
            : mapa[coluna];
        const exib = alvo && campo ? (def.campos[campo] ?? null) : null;
        if (exib === 'ocultar' && valor.estado !== 'nao_se_aplica') {
          expect(ehOculto(valor, g)).toBe(true);
        } else {
          expect(ehEstadoEmConferencia(valor)).toBe(false);
        }
      }
    }
  });

  it('Semáforo e Índice: critérios do grupo "Sem dado"; Índice incompleto só com componente', () => {
    const s = semaforoDe(classe, flags);
    const marcados = g === 'historico' ? [] : def.criteriosSemaforo;
    for (const c of s) {
      expect(c.status === 'sem_dado').toBe(marcados.includes(c.codigo));
      expect(encontrarPalavrasProibidas(c.frase)).toEqual([]);
    }
    expect([...criteriosEmConferencia([g]).keys()].sort()).toEqual([...marcados].sort());

    const confs = montarConferenciasTela({ flags, classe });
    expect(confs.map((c) => c.grupo)).toEqual([g]);
    const comps = g === 'historico' ? [] : componentesDoGrupo(g, classe);
    expect(confs[0].efeitoIndice !== null).toBe(comps.length > 0);
    expect([...componentesEmConferencia(confs, classe)].sort()).toEqual([...comps].sort());
    for (const c of confs) {
      expect(encontrarPalavrasProibidas(`${c.motivo} ${c.efeitoIndice ?? ''}`)).toEqual([]);
    }
    // página: o campo principal acha a mesma conferência pelo helper único
    expect(conferenciaDoCampo(confs, def.campoPrincipal)?.grupo).toBe(g);
  });

  it('Dividendos e gráfico: selo do grupo proventos; cotação tracejada desde a detecção', () => {
    const d = montarDividendos({
      classe,
      hoje: HOJE,
      anos: ANOS.map((a) => ({ ano: a, valor: 0.5, payoutPct: 50 })),
      ult12m: 0.5,
      ult12mData: '2026-09-29',
      conferenciaProventos: gruposConf(flags).includes('proventos'),
    });
    expect(d.selo === 'em_conferencia').toBe(g === 'proventos');

    const confs = montarConferenciasTela({ flags, classe });
    const cot = confs.find((c) => c.grupo === 'preco_base' || c.grupo === 'preco_esporadico');
    if (g === 'preco_base' || g === 'preco_esporadico') {
      expect(cot?.desde).toBe('2026-04-29');
      const mensal = ['2026-02', '2026-03', '2026-04', '2026-05'].map((chave) => ({ chave }));
      expect(indiceDesde(mensal, cot!.desde!)).toBe(2);
      const anual = ['2024', '2025', '2026'].map((chave) => ({ chave }));
      expect(indiceDesde(anual, cot!.desde!)).toBe(2);
    } else {
      expect(cot).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Regressão v1
// ---------------------------------------------------------------------------

describe('regressão: params v1 (sem flag conf:) = tela da Fase 1', () => {
  it('legado de proventos: DY finito continua ok + selo (valor visível, sem ir para o fim)', () => {
    const row = linhaAcao({
      paramsVersion: 1,
      flags: ['proventos_em_conferencia_dy_acima_teto'],
    });
    const api = paraLinhaQuadroApi(row);
    expect(api.dy12m).toEqual({ estado: 'ok', valor: 5 });
    expect(api.proventosEmConferencia).toBe(true);
    expect('conferencias' in api).toBe(false);
    expect(conferenciaDaLinha(api, 'dy12m')).toBeNull();

    const dy = kpisDe(api, 'acao').find((k) => k.codigo === 'dy12m')!;
    expect(dy.valor).toEqual({ estado: 'ok', valor: 5 });
    expect(dy.selo).toBe('proventos_em_conferencia');

    expect(montarConferenciasTela({ flags: row.flags, classe: 'acao' })).toEqual([]);
    const d = montarDividendos({
      classe: 'acao',
      hoje: HOJE,
      anos: ANOS.map((a) => ({ ano: a, valor: 0.5 })),
      ult12m: 0.5,
      ult12mData: '2026-09-29',
      proventosEmConferencia: true,
      conferenciaProventos: false,
    });
    expect(d.selo).toBe('proventos_em_conferencia');
  });

  it('linhas da Fase 1: nenhum campo em conferência, sem `conferencias`, valor de mercado intacto', () => {
    for (const row of LINHAS_FIXTURE) {
      const api = paraLinhaQuadroApi(row);
      expect('conferencias' in api).toBe(false);
      for (const campo of [
        'roe',
        'pl',
        'pvp',
        'dy12m',
        'margemLiquida',
        'divLiqEbitda',
        'payout',
        'vacanciaCvm',
        'obrigacoesPl',
      ] as const) {
        expect(ehEstadoEmConferencia(api[campo])).toBe(false);
      }
      const vm = row.valorMercado === null ? null : Number(row.valorMercado.toString());
      expect(api.valorMercado).toBe(vm);
      expect(kpisDe(api, api.classe).some((k) => k.selo === 'em_conferencia')).toBe(false);
      expect(montarConferenciasTela({ flags: row.flags, classe: api.classe })).toEqual([]);
    }
  });

  it('flags rev: e info: não mudam nada na tela', () => {
    const row = linhaAcao({ flags: ['rev:variacao_lucro@2025', 'info:cotacao_esporadica'] });
    const api = paraLinhaQuadroApi(row);
    expect({ ...api, flags: [] }).toEqual(paraLinhaQuadroApi({ ...row, flags: [] }));
    expect('conferencias' in api).toBe(false);
    expect(semaforoDe('acao', row.flags).every((c) => c.status === 'atende')).toBe(true);
  });
});
