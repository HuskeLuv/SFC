/**
 * fundamentei-regras (F2, A4.a/A4.b/A4.c) nos jobs: derivados anuais (linhasDerivadasAcao) e múltiplos
 * do dia (calcularAtualAcao) com a scoring v1/v2 (= hoje, regressão) e com a v3 (payout de caixa,
 * data-ex, corte de futuros, exercício real). Empresa e banco SINTÉTICOS (números redondos, sem
 * valores de terceiros).
 */
import { describe, expect, it } from 'vitest';
import {
  linhasDerivadasAcao,
  type MemoriaCalculo,
} from '@/services/analiseAtivos/calculo/recalcularDerivados';
import { calcularAtualAcao } from '@/services/analiseAtivos/calculo/recalcularAtuais';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { SCORING_PARAMS_V2 } from '@/services/analiseAtivos/params/scoringParamsV2';
import { SCORING_PARAMS_V3 } from '@/services/analiseAtivos/params/scoringParamsV3';
import { SCORING_PARAMS_V4 } from '@/services/analiseAtivos/params/scoringParamsV4';
import type { ScoringParams } from '@/services/analiseAtivos/params/scoringParamsSchema';
import { payoutCaixaPct } from '@/services/analiseAtivos/regras/calculo/multiplos';
import type {
  ContagemAcoes,
  CotacaoDia,
  FundamentosPeriodo,
  ProventoAuditado,
  TickerAcao,
} from '@/services/analiseAtivos/tipos';
import type { ProventoAuditadoCompleto } from '@/services/analiseAtivos/regras/calculo/proventos';

const MI = 1e6;
const ticker: TickerAcao = {
  symbol: 'SINT3',
  cnpj: 'C1',
  classeTitulo: 'ON',
  unitQtdOn: null,
  unitQtdPn: null,
};

function fy(ano: number, extra: Partial<FundamentosPeriodo> = {}): FundamentosPeriodo {
  return {
    emissorId: 'C1',
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
    receita: 6000 * MI,
    lucroBruto: null,
    ebit: 1300 * MI,
    depreciacaoAmortizacao: 100 * MI,
    lucroLiquido: 1000 * MI,
    lucroAtribuivel: 1000 * MI,
    ativoTotal: 8000 * MI,
    ativoCirculante: 3000 * MI,
    passivoCirculante: 2000 * MI,
    caixa: 1000 * MI,
    aplicacoesFinanceiras: 0,
    dividaBrutaCp: 200 * MI,
    dividaBrutaLp: 300 * MI,
    pl: 4000 * MI,
    plControladora: 4000 * MI,
    fco: 1200 * MI,
    fci: null,
    fcf: null,
    capex: 400 * MI,
    dividendosJcpPagos: 600 * MI,
    dmplDeclarado: 500 * MI,
    lpaOn: null,
    lpaPn: null,
    naoSeAplica: [],
    flags: [],
    ...extra,
  };
}

const contagem = (data: string): ContagemAcoes => ({
  cnpj: 'C1',
  data,
  on: 100 * MI,
  pn: 0,
  total: 100 * MI,
  fonte: 'dfp',
  razaoLpa: 1,
  status: 'ok',
});

function provento(dataComReal: string, valor: number): ProventoAuditadoCompleto {
  const base: ProventoAuditado = {
    origemId: `p-${dataComReal}`,
    symbol: 'SINT3',
    tipoNormalizado: 'DIVIDENDO',
    valor,
    dataPagamento: null,
    dataComReal,
    status: 'valido',
    duplicataDe: null,
    fatorAjusteHoje: 1,
    flags: [],
  };
  return {
    ...base,
    source: 'BRAPI',
    tipoOriginal: 'DIVIDENDO',
    dataExGravada: dataComReal,
    dataExOrigem: 'dataCom',
    valorAjustadoHoje: valor,
  };
}

const cotacao = (date: string, closeRaw: number): CotacaoDia => ({
  symbol: 'SINT3',
  date,
  closeRaw,
  volumeFin: 1e8,
  negocios: 1000,
  codBdi: '02',
});

function memoria(provs: ProventoAuditadoCompleto[]): MemoriaCalculo {
  return {
    eventos: new Map(),
    proventos: new Map([['SINT3', provs]]),
    cobertura: new Map([['SINT3', 'OK']]),
  };
}

function derivar(p: ScoringParams, fys: FundamentosPeriodo[], provs: ProventoAuditadoCompleto[]) {
  const precoFim = new Map<string, CotacaoDia | null>(
    fys.map((f) => [`SINT3|${f.dtFim}`, cotacao(f.dtFim, 50)]),
  );
  return linhasDerivadasAcao(
    {
      cnpj: 'C1',
      tickers: [ticker],
      fys,
      contagens: fys.map((f) => contagem(f.dtFim)),
      precoFim,
      memoria: memoria(provs),
      ehFinanceira: false,
    },
    p,
    { paramsVersion: p.versao, agora: new Date('2026-10-20T12:00:00Z'), hoje: '2026-10-20' },
  );
}

/** v2 com as regras de cálculo explícitas nos padrões (= v2 sem os campos). */
const V2_PADROES_EXPLICITOS: ScoringParams = {
  ...structuredClone(SCORING_PARAMS_V2),
  payout: { regra: 'dmpl_dpa' },
  proventos: { baseJanelaDy: 'com', cortarFuturos: false, dpaPorExercicio: false },
  serie10aPorDtFim: false,
};

describe('payoutCaixaPct (A4.a)', () => {
  it('proventos pagos na DFC ÷ lucro atribuível, em %', () => {
    expect(payoutCaixaPct(fy(2025))).toEqual({ estado: 'ok', valor: 60 });
  });
  it("lucro ≤ 0 ⇒ ausente 'prejuizo' (a tela mostra 'L')", () => {
    expect(payoutCaixaPct(fy(2025, { lucroAtribuivel: -10 * MI }))).toEqual({
      estado: 'ausente',
      motivo: 'outro',
      detalhe: 'prejuizo',
    });
    expect(payoutCaixaPct(fy(2025, { lucroAtribuivel: 0 }))).toMatchObject({
      detalhe: 'prejuizo',
    });
  });
  it('sem DFC ⇒ ausente; sem lucro ⇒ o motivo do lucro', () => {
    expect(payoutCaixaPct(fy(2025, { dividendosJcpPagos: null }))).toMatchObject({
      estado: 'ausente',
      detalhe: 'dfc',
    });
    expect(
      payoutCaixaPct(fy(2025, { lucroAtribuivel: null, flags: ['controladora_zero'] })),
    ).toEqual({ estado: 'ausente', motivo: 'controladora_zero' });
  });
});

describe('derivados anuais: v1/v2 = hoje; v3 = payout de caixa e data-ex', () => {
  const fys = [fy(2024), fy(2025)];
  const provs = [provento('2025-05-12', 2), provento('2025-12-30', 3)];

  it('v1 e v2: payoutPct = DMPL ÷ lucro (50%) e DPA por data-com no ano civil', () => {
    for (const p of [SCORING_PARAMS_V1, SCORING_PARAMS_V2]) {
      const r = derivar(p, fys, provs);
      const m25 = r.multiplos.find((m) => m.anoFiscal === 2025)!;
      const ps25 = r.perShare.find((x) => x.anoFiscal === 2025)!;
      expect(m25.payoutPct).toBeCloseTo(50, 10);
      expect(ps25.payoutDmplPct).toBeCloseTo(50, 10);
      expect(ps25.dpaDataCom).toBeCloseTo(5, 10);
      expect(m25.dyPct).toBeCloseTo(10, 10);
    }
  });

  it('v2 sem os campos novos = v2 com os padrões explícitos (regressão, linha a linha)', () => {
    const a = derivar(SCORING_PARAMS_V2, fys, provs);
    const b = derivar(V2_PADROES_EXPLICITOS, fys, provs);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('v3: payoutPct = DFC ÷ lucro (60%); payoutDmplPct segue gravado; data-ex de 30/12 vai a 2026', () => {
    const r = derivar(SCORING_PARAMS_V3, fys, provs);
    const m25 = r.multiplos.find((m) => m.anoFiscal === 2025)!;
    const ps25 = r.perShare.find((x) => x.anoFiscal === 2025)!;
    expect(m25.payoutPct).toBeCloseTo(60, 10);
    expect(ps25.payoutDmplPct).toBeCloseTo(50, 10);
    expect(ps25.dpaDataCom).toBeCloseTo(2, 10);
    expect(m25.dyPct).toBeCloseTo(4, 10);
  });

  it('v3 com prejuízo: payoutPct nulo (ausente, não n/a)', () => {
    const r = derivar(SCORING_PARAMS_V3, [fy(2025, { lucroAtribuivel: -50 * MI })], provs);
    const m = r.multiplos[0];
    expect(m.payoutPct).toBeNull();
    expect(m.naoSeAplica).not.toContain('payoutPct');
  });

  it('v3, exercício mar–fev (sintético): DPA do exercício contra o preço do último pregão dele', () => {
    const fyFev = fy(2026, { dtIni: '2025-03-01', dtFim: '2026-02-28' });
    const provsFev = [
      provento('2025-05-12', 1),
      provento('2026-01-15', 1),
      provento('2026-11-30', 4), // anunciado, data-ex futura
    ];
    const v2 = derivar(SCORING_PARAMS_V2, [fyFev], provsFev);
    const v3 = derivar(SCORING_PARAMS_V3, [fyFev], provsFev);
    // v2: ano civil 2026 (15/01 + 30/11) = 5; v3: data-ex em mar/25–fev/26 = 2
    expect(v2.perShare[0].dpaDataCom).toBeCloseTo(5, 10);
    expect(v3.perShare[0].dpaDataCom).toBeCloseTo(2, 10);
    expect(v3.multiplos[0].dyPct).toBeCloseTo(4, 10);
  });

  it('v4, o mesmo exercício mar–fev: DPA pelo ano-calendário da data-ex, sem a data-ex futura', () => {
    const fyFev = fy(2026, { dtIni: '2025-03-01', dtFim: '2026-02-28' });
    const provsFev = [
      provento('2025-05-12', 1),
      provento('2026-01-15', 1),
      provento('2026-11-30', 4), // anunciado, data-ex futura
    ];
    const v4 = derivar(SCORING_PARAMS_V4, [fyFev], provsFev);
    // ano civil 2026 pela data-ex = só 15/01 (30/11 é futura); o payout não muda (DFC do exercício)
    expect(v4.perShare[0].dpaDataCom).toBeCloseTo(1, 10);
    expect(v4.multiplos[0].payoutPct).toEqual(
      derivar(SCORING_PARAMS_V3, [fyFev], provsFev).multiplos[0].payoutPct,
    );
  });
});

describe('múltiplos do dia: payout TTM', () => {
  const ttm = fy(2026, {
    tipoPeriodo: 'TTM',
    dtIni: '2025-07-01',
    dtFim: '2026-06-30',
    dividendosJcpPagos: 450 * MI,
    lucroAtribuivel: 900 * MI,
    lucroLiquido: 900 * MI,
  });
  const entrada = (fund: FundamentosPeriodo) => ({
    ticker,
    resumo: {
      symbol: 'SINT3',
      ultimoPregao: '2026-10-20',
      closeRaw: 50,
      volumeMedio21: 1e8,
      pregoesComNegocio21: 21,
      baixaLiquidez: false,
      negociadoUltimos30: true,
    },
    tickersEmpresa: [ticker],
    resumosEmpresa: new Map([['SINT3', 50]]),
    fundAtual: fund,
    fys: [fy(2024), fy(2025)],
    contagens: [contagem('2025-12-31')],
    emissor: undefined,
    proventos: [provento('2025-10-20', 1), provento('2026-03-10', 2)],
    eventos: [],
    cobertura: 'OK' as const,
    historicoPl: [],
    dataRef: '2026-10-20',
  });

  it('v1: DPA 12m ÷ LPA TTM (por data-com)', () => {
    const r = calcularAtualAcao(entrada(ttm), SCORING_PARAMS_V1);
    expect(r.dpa12m).toEqual({ estado: 'ok', valor: 2 });
    // LPA TTM = 900 mi ÷ 100 mi = 9 ⇒ 2 ÷ 9
    expect(r.payoutPct.estado === 'ok' && r.payoutPct.valor).toBeCloseTo((2 / 9) * 100, 8);
  });

  it('v3: DFC TTM ÷ lucro TTM = 50%; DY 12m pela data-ex (21/10/2025 entra)', () => {
    const r = calcularAtualAcao(entrada(ttm), SCORING_PARAMS_V3);
    expect(r.payoutPct).toEqual({ estado: 'ok', valor: 50 });
    expect(r.dpa12m).toEqual({ estado: 'ok', valor: 3 });
  });

  it("v3 com prejuízo no TTM: ausente 'prejuizo'", () => {
    const r = calcularAtualAcao(
      entrada({ ...ttm, lucroAtribuivel: -1 * MI, lucroLiquido: -1 * MI }),
      SCORING_PARAMS_V3,
    );
    expect(r.payoutPct).toMatchObject({ estado: 'ausente', detalhe: 'prejuizo' });
  });
});
