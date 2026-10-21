/**
 * fundamentei-regras (fatia F1) — REGRESSÃO: as versões já gravadas do criteria_params (v2 vigente
 * em prod; v3 e v4 inertes) têm de avaliar EXATAMENTE como antes do motor novo (tipo 'cagr',
 * mesReferencia 'data_com', margem por perfil, séries ajustadas do REIT). O snapshot deste arquivo
 * foi gerado com o código de ANTES da F1 e não pode mudar.
 *
 * Caminho do job, com as fixtures do DEV já usadas pelos outros testes (dev-2026-10-13.json e
 * eua-dev.json) e os casos sintéticos de meses dos FIIs do backtest de 18/10 (KNRI11, BTHF11,
 * RZTR11) e o calendário de HCTR11 de 2021–2022 (duas datas-com em jan/2022).
 */
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  executarCriteriosEua,
  type DependenciasCriteriosEua,
} from '@/services/analiseAtivos/calculo/executarCriteriosEua';
import { seriesDosPerfis } from '@/services/analiseAtivos/calculo/executarCriterios';
import { pontosCvmAcao, pontosCvmFii } from '@/services/analiseAtivos/fontes/fundamentos/fonteCvm';
import { resolverSeries } from '@/services/analiseAtivos/fontes/fundamentos/resolverSeries';
import {
  fontesEfetivas,
  type CriteriaParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V2 } from '@/services/analiseAtivos/params/criteriaParamsV2';
import { CRITERIA_PARAMS_V3 } from '@/services/analiseAtivos/params/criteriaParamsV3';
import { CRITERIA_PARAMS_V4 } from '@/services/analiseAtivos/params/criteriaParamsV4';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { avaliarAtivo } from '@/services/analiseAtivos/regras/criterios/avaliarAtivo';
import {
  avaliarMeses,
  mesesAteAnoFim,
  type ProventoMeses,
} from '@/services/analiseAtivos/regras/criterios/mesesJanela';
import { perfilCriterios } from '@/services/analiseAtivos/regras/criterios/perfilCriterios';
import {
  opcoesSeriesAcao,
  type BrutoAcao,
} from '@/services/analiseAtivos/regras/criterios/seriesAcao';
import {
  imoveisPlPctFii,
  mesesFii,
  type BrutoFii,
} from '@/services/analiseAtivos/regras/criterios/seriesFii';
import type { BrutoSec, FySec } from '@/services/analiseAtivos/regras/criterios/seriesStock';
import type { JobContexto, ScoringParams } from '@/services/analiseAtivos/tipos';
import type { AvaliacaoAtivo, Janela } from '@/types/analiseAtivosCriterios';
import fixture from './fixtures/dev-2026-10-13.json';
import fixtureEua from './fixtures/eua-dev.json';

const ANO_FIM = fixture.anoFim;
const SCORING = { sanidade: { proventos: fixture.proventosParams } } as unknown as ScoringParams;
type AcaoFixture = BrutoAcao & { symbols: string[] };
const ACOES = fixture.acoes as unknown as AcaoFixture[];
const FIIS = fixture.fiis as unknown as BrutoFii[];

const VERSOES: Array<[string, CriteriaParams]> = [
  ['v2', CRITERIA_PARAMS_V2],
  ['v4', CRITERIA_PARAMS_V4],
];

function avaliarAcao(a: AcaoFixture, symbol: string, P: CriteriaParams): AvaliacaoAtivo {
  const perfil = perfilCriterios(
    { classe: 'acao', ehFinanceira: a.ehFinanceira, fiiTipo: null, imoveisPlPct: null },
    P,
  );
  const r = resolverSeries({
    pontos: pontosCvmAcao(a, [symbol], opcoesSeriesAcao(P)),
    series: seriesDosPerfis(P, ['acao']),
    fontes: fontesEfetivas(P),
  });
  return avaliarAtivo(
    {
      symbol,
      classe: 'acao',
      perfil,
      anoFim: ANO_FIM,
      series: r.series,
      origens: r.origens,
      meses: null,
    },
    P,
    P.versao,
  );
}

function avaliarFii(f: BrutoFii, P: CriteriaParams): AvaliacaoAtivo {
  const perfil = perfilCriterios(
    { classe: 'fii', ehFinanceira: false, fiiTipo: f.fiiTipo, imoveisPlPct: imoveisPlPctFii(f) },
    P,
  );
  const r = resolverSeries({
    pontos: pontosCvmFii(f, { anoFim: ANO_FIM, scoring: SCORING }),
    series: seriesDosPerfis(P, ['fii_tijolo', 'fii_papel']),
    fontes: fontesEfetivas(P),
  });
  return avaliarAtivo(
    {
      symbol: f.symbol,
      classe: 'fii',
      perfil,
      anoFim: ANO_FIM,
      series: r.series,
      origens: r.origens,
      meses: mesesFii(f, ANO_FIM, SCORING),
    },
    P,
    P.versao,
  );
}

// ------------------------------------------------------------------ meses (casos sintéticos)

/** Um rendimento por mês de `de` a `ate` (AAAA-MM), pago no dia 15, data-com no dia 1. */
function pagamentos(de: string, ate: string, pular: string[] = []): ProventoMeses[] {
  return mesesEntre(de, ate)
    .filter((m) => !pular.includes(m))
    .map((m) => ({
      status: 'valido',
      tipoNormalizado: 'RENDIMENTO',
      dataPagamento: `${m}-15`,
      dataComReal: `${m}-01`,
    }));
}

function mesesEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  let [a, m] = de.split('-').map(Number);
  const [aFim, mFim] = ate.split('-').map(Number);
  while (a < aFim || (a === aFim && m <= mFim)) {
    out.push(`${a}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      a++;
    }
  }
  return out;
}

const cvm = (com: string[], zero: string[] = []) => ({
  comRendimento: new Set(com),
  semRendimento: new Set(zero),
});

/** HCTR11 out/2021–abr/2022 (calendário do banco de DEV): duas datas-com em jan/2022. */
const HCTR11_2122: ProventoMeses[] = [
  ['2021-10-06', '2021-10-15'],
  ['2021-11-05', '2021-11-16'],
  ['2021-12-06', '2021-12-14'],
  ['2022-01-06', '2022-01-14'],
  ['2022-01-28', '2022-02-07'],
  ['2022-03-07', '2022-03-15'],
  ['2022-04-06', '2022-04-14'],
].map(([dataComReal, dataPagamento]) => ({
  status: 'valido',
  tipoNormalizado: 'RENDIMENTO',
  dataComReal,
  dataPagamento,
}));

const S = SCORING_PARAMS_V1;

/** Casos de meses: [nome, proventos, anoFim, cvm?] */
const CASOS_MESES: Array<
  [string, ProventoMeses[], number, ReturnType<typeof cvm> | undefined, Janela[]]
> = [
  [
    'KNRI11',
    pagamentos('2016-01', '2025-12', [
      '2016-02',
      '2016-03',
      '2016-04',
      '2016-05',
      '2016-06',
      '2017-02',
    ]),
    2025,
    cvm(mesesEntre('2017-01', '2025-12')),
    [5, 10],
  ],
  [
    'BTHF11',
    pagamentos('2023-01', '2025-12', [
      '2023-01',
      '2023-10',
      '2023-11',
      '2024-01',
      '2024-02',
      '2024-03',
      '2024-04',
      '2024-05',
      '2024-07',
      '2024-08',
      '2024-10',
    ]),
    2025,
    cvm(mesesEntre('2023-02', '2025-12'), ['2023-01']),
    [3, 5],
  ],
  [
    'RZTR11',
    pagamentos('2020-01', '2025-12', ['2021-01']),
    2025,
    cvm(mesesEntre('2021-01', '2025-12'), ['2020-10', '2020-11', '2020-12']),
    [3, 5],
  ],
  [
    'HCTR11',
    [...pagamentos('2019-01', '2021-09'), ...HCTR11_2122, ...pagamentos('2022-05', '2025-12')],
    2025,
    cvm(mesesEntre('2019-01', '2025-12')),
    [3, 5],
  ],
];

// ------------------------------------------------------------------ EUA (job com deps)

interface EmpresaFixture {
  symbol: string;
  cik: string;
  classe: 'stock' | 'reit';
  ehFinanceira: boolean;
  sic: number;
  fys: FySec[];
}
const EMPRESAS = fixtureEua.empresas as unknown as EmpresaFixture[];
const SIMBOLOS_EUA = ['AAPL', 'MSFT', 'JPM', 'O', 'PLD'];

async function avaliarEua(P: CriteriaParams): Promise<Array<{ symbol: string; janela: number }>> {
  const capturadas: Array<{ symbol: string; janela: number }> = [];
  const deps: DependenciasCriteriosEua = {
    obterParams: async () => ({ versao: P.versao, params: P }),
    carregarUniverso: async () =>
      SIMBOLOS_EUA.map((s) => {
        const e = EMPRESAS.find((x) => x.symbol === s) as EmpresaFixture;
        return {
          cik: e.cik,
          cikFundamentos: e.cik,
          classe: e.classe,
          ehFinanceira: e.ehFinanceira,
          sic: e.sic,
          symbols: [s],
        };
      }),
    lerBrutos: async (_p, ciks) =>
      new Map(
        ciks.map((cik) => {
          const e = EMPRESAS.find((x) => x.cik === cik);
          return [cik, { cik, fys: e?.fys ?? [] } satisfies BrutoSec];
        }),
      ),
    gravar: async (_p, linhas) => {
      capturadas.push(...(linhas as unknown as typeof capturadas));
      return linhas.length;
    },
  };
  const ctx = {
    prisma: {} as PrismaClient,
    prazo: Date.now() + 60_000,
    restanteMs: () => 60_000,
    estourouPrazo: () => false,
    alertar: () => undefined,
    contar: () => undefined,
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje: '2026-10-17',
    origem: 'script',
    aplicar: true,
  } as unknown as JobContexto;
  await executarCriteriosEua(ctx, deps);
  // computedAt muda a cada execução: fora do snapshot
  return capturadas.map((l) => {
    const { computedAt: _c, ...resto } = l as typeof l & { computedAt?: unknown };
    return resto;
  });
}

describe.each(VERSOES)('regressão %s: criteria_eval igual ao de antes da F1', (_v, P) => {
  it('ações (WEGE3, ITUB4, ITSA4, BBSE3, BBAS3, PETR4, TAEE11, AZUL3)', () => {
    const out: Record<string, AvaliacaoAtivo> = {};
    for (const a of ACOES) for (const s of a.symbols) out[s] = avaliarAcao(a, s, P);
    expect(out).toMatchSnapshot();
  });

  it('FIIs (HGLG11, KNCR11, MXRF11, XPLG11)', () => {
    const out: Record<string, AvaliacaoAtivo> = {};
    for (const f of FIIS) out[f.symbol] = avaliarFii(f, P);
    expect(out).toMatchSnapshot();
  });

  it('meses com rendimento: KNRI11, BTHF11, RZTR11 e HCTR11', () => {
    const out: Record<string, unknown> = {};
    for (const [nome, prov, anoFim, c, janelas] of CASOS_MESES) {
      const m = mesesAteAnoFim(prov, anoFim, S, c);
      out[nome] = {
        meses: m,
        janelas: Object.fromEntries(janelas.map((j) => [j, avaliarMeses(m, anoFim, j, P)])),
      };
    }
    expect(out).toMatchSnapshot();
  });
});

describe('regressão v3 e v4 do job EUA (AAPL, MSFT, JPM, O, PLD)', () => {
  it.each([
    ['v3', CRITERIA_PARAMS_V3],
    ['v4', CRITERIA_PARAMS_V4],
  ] as const)('%s: linhas de criteria_eval iguais às de antes da F1', async (_v, P) => {
    expect(await avaliarEua(P)).toMatchSnapshot();
  });
});
