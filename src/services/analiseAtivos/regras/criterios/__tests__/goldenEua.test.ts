/**
 * GOLDEN dos Filtros de Fundamentos EUA (fatia B): 27 empresas da fixture recortada da SEC
 * (fixtures/eua-dev.json) × janelas 3/5/10, com a criteria_params v3, o MESMO avaliarAtivo do
 * Brasil e o caminho do job (pontosSec → resolverSeries pela prioridade do mercado → ajustarFatosEua).
 * anoFim 2025 (âncora global de 17/10/2026).
 *
 * Conferência com a medição do desenho (medicao-criterios.json, 20 empresas):
 *  - stocks: as 10 medidas batem nas 3 janelas (atendidos e sem dado), salvo JNJ na janela 10
 *    (medição '1 de 6 · sem dado 1'; aqui 2 de 6 sem 'sem dado': a fixture tem D&A em 2014–2015);
 *  - REITs: a medição usou a lista antiga (rec, dps, fco_acao, dl6, pay_fco, mg). Os critérios
 *    comuns batem (rec/dpa/fco_acao/dl na janela 5 dos 10 medidos), com 3 divergências DECIDIDAS
 *    no desenho em 'pay': SPG e PSA passam a ter dado (dividendos = DPA × média diluída e
 *    PaymentsOfCapitalDistribution — cadeia ampliada) e DLR não atende (93% em 2023 > 90%, o
 *    limite da spec). 'ocup' é sempre 'sem dado' (inativa) e conta no "de 6";
 *  - AMH e EQR: receita sem dado de 2021 em diante — a receita total deles está em
 *    OperatingLeaseLeaseIncome, fora da cadeia do desenho (pendência registrada para a fatia A).
 */
import { describe, expect, it } from 'vitest';
import {
  ajustarFatosEua,
  fontesDoMercado,
  seriesDoPerfilEua,
} from '@/services/analiseAtivos/calculo/executarCriteriosEua';
import { pontosSec } from '@/services/analiseAtivos/fontes/fundamentos/fonteSec';
import { resolverSeries } from '@/services/analiseAtivos/fontes/fundamentos/resolverSeries';
import { fontesEfetivas } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V3 } from '@/services/analiseAtivos/params/criteriaParamsV3';
import { avaliarAtivo } from '@/services/analiseAtivos/regras/criterios/avaliarAtivo';
import { perfilCriteriosEua } from '@/services/analiseAtivos/regras/criterios/perfilCriteriosEua';
import type { FySec } from '@/services/analiseAtivos/regras/criterios/seriesStock';
import type { AvaliacaoAtivo, EstadoCriterio } from '@/types/analiseAtivosCriterios';
import fixture from './fixtures/eua-dev.json';

const P = CRITERIA_PARAMS_V3;
const ANO_FIM = 2025;

interface EmpresaFixture {
  symbol: string;
  cik: string;
  classe: 'stock' | 'reit';
  ehFinanceira: boolean;
  sic: number;
  fys: FySec[];
}
const EMPRESAS = fixture.empresas as unknown as EmpresaFixture[];

function avaliarFixture(e: EmpresaFixture): AvaliacaoAtivo {
  const perfil = perfilCriteriosEua({ classe: e.classe, ehFinanceira: e.ehFinanceira, sic: e.sic });
  const pontos = pontosSec({ cik: e.cik, fys: e.fys }, [e.symbol], e.classe, {
    receitaMenorQueLucro: P.criterios.margem.receitaMenorQueLucro,
  });
  const r = resolverSeries({
    pontos,
    series: seriesDoPerfilEua(P, perfil),
    fontes: fontesDoMercado(fontesEfetivas(P), e.classe),
  });
  return ajustarFatosEua(
    avaliarAtivo(
      {
        symbol: e.symbol,
        classe: e.classe,
        perfil,
        anoFim: ANO_FIM,
        series: r.series,
        origens: r.origens,
        meses: null,
      },
      P,
      P.versao,
    ),
    r.series.cash_payout_pct,
  );
}

const COD: Record<EstadoCriterio, string> = {
  atende: 'A',
  nao_atende: 'N',
  sem_dado: 'S',
  nao_se_aplica: '-',
};

/**
 * Esperado por janela: os 6 estados na ordem do perfil (A atende · N não atende · S sem dado).
 * stock: rec luc ebitda mg dl fcl · reit: rec dpa fco_acao dl pay ocup.
 */
const GOLDEN: Record<string, { perfil: string; '3': string; '5': string; '10': string }> = {
  AAPL: { perfil: 'stock', '3': 'NNNAAN', '5': 'NNNAAN', '10': 'NNNAAN' },
  MSFT: { perfil: 'stock', '3': 'ANAAAN', '5': 'ANAAAN', '10': 'NNAAAN' },
  KO: { perfil: 'stock', '3': 'ANNAAN', '5': 'ANNAAN', '10': 'NNNAAN' },
  JNJ: { perfil: 'stock', '3': 'ANNAAN', '5': 'NNNAAN', '10': 'NNNAAN' },
  NVDA: { perfil: 'stock', '3': 'AAAAAA', '5': 'ANNAAS', '10': 'NNNAAS' },
  XOM: { perfil: 'stock', '3': 'NNNAAN', '5': 'NNNAAN', '10': 'NNNNAN' },
  WMT: { perfil: 'stock', '3': 'AAAAAN', '5': 'ANNAAN', '10': 'ANNAAN' },
  GOOGL: { perfil: 'stock', '3': 'AAAAAA', '5': 'ANSAAN', '10': 'ANSASN' },
  LLY: { perfil: 'stock', '3': 'ANNAAN', '5': 'ANNAAN', '10': 'NNNNAN' },
  JPM: { perfil: 'stock_financeira', '3': 'ANNASS', '5': 'ANNASS', '10': 'ANNASS' },
  'BRK.B': { perfil: 'stock_financeira', '3': 'ANNASN', '5': 'ANNNSN', '10': 'NNNNSN' },
  O: { perfil: 'reit', '3': 'AANNAS', '5': 'AANNAS', '10': 'AANSAS' },
  PLD: { perfil: 'reit', '3': 'AANAAS', '5': 'AANAAS', '10': 'AANNAS' },
  SPG: { perfil: 'reit', '3': 'AANAAS', '5': 'ANNNAS', '10': 'NNNNAS' },
  AMT: { perfil: 'reit', '3': 'AAANAS', '5': 'AANNAS', '10': 'AANNAS' },
  PSA: { perfil: 'reit', '3': 'ANNAAS', '5': 'ANNANS', '10': 'ANNANS' },
  EQIX: { perfil: 'reit', '3': 'AANAAS', '5': 'AANAAS', '10': 'ANNAAS' },
  WELL: { perfil: 'reit', '3': 'ANASAS', '5': 'ANNSAS', '10': 'NNNSNS' },
  AVB: { perfil: 'reit', '3': 'AAAAAS', '5': 'NNNAAS', '10': 'NNNAAS' },
  VICI: { perfil: 'reit', '3': 'AANAAS', '5': 'AANNAS', '10': 'SSSSSS' },
  DLR: { perfil: 'reit', '3': 'AANNNS', '5': 'ANNNNS', '10': 'ANNNNS' },
  ARE: { perfil: 'reit', '3': 'NANNAS', '5': 'NANNAS', '10': 'NANNAS' },
  CPT: { perfil: 'reit', '3': 'NANAAS', '5': 'NNNAAS', '10': 'NNNANS' },
  BXP: { perfil: 'reit', '3': 'ANNAAS', '5': 'ANNAAS', '10': 'NNNAAS' },
  AMH: { perfil: 'reit', '3': 'SAAAAS', '5': 'SAAAAS', '10': 'SNNNAS' },
  EQR: { perfil: 'reit', '3': 'SAAAAS', '5': 'SANAAS', '10': 'SNNANS' },
  // CCI: dividendos pagos com sinal trocado nos 10-K de 2020/2025/2026 (valor absoluto na extração);
  // 'pay' não atende por 2024 (US$ 2.729 mi ÷ 2.943 mi = 92,7% > 90%)
  CCI: { perfil: 'reit', '3': 'NNNNNS', '5': 'NNNNNS', '10': 'NNNNNS' },
};

const IDS_STOCK = ['rec', 'luc', 'ebitda', 'mg', 'dl', 'fcl'];
const IDS_REIT = ['rec', 'dpa', 'fco_acao', 'dl', 'pay', 'ocup'];

describe('golden EUA — 27 empresas × 3 janelas (v3)', () => {
  it('a tabela cobre toda a fixture', () => {
    expect(Object.keys(GOLDEN).sort()).toEqual(EMPRESAS.map((e) => e.symbol).sort());
  });

  it.each(EMPRESAS.map((e) => [e.symbol, e] as const))('%s', (symbol, e) => {
    const a = avaliarFixture(e);
    const g = GOLDEN[symbol];
    expect(a.perfil).toBe(g.perfil);
    for (const j of ['3', '5', '10'] as const) {
      const jan = a.janelas[j];
      expect(jan.resultados.map((r) => r.id)).toEqual(e.classe === 'reit' ? IDS_REIT : IDS_STOCK);
      expect(jan.resultados.map((r) => COD[r.estado]).join(''), `${symbol} janela ${j}`).toBe(g[j]);
      // n de 6 SEMPRE (financeiras literal; REIT com a ocupação inativa no denominador)
      expect(jan.aplicaveis).toBe(6);
      expect(jan.atendidos).toBe([...g[j]].filter((c) => c === 'A').length);
      expect(jan.anoFim).toBe(ANO_FIM);
    }
  });

  it('ocup: inativa, "sem dado" com o motivo da ocupação (conta no de 6)', () => {
    const o = avaliarFixture(EMPRESAS.find((e) => e.symbol === 'O') as EmpresaFixture);
    const ocup = o.janelas['5'].resultados.find((r) => r.id === 'ocup');
    expect(ocup).toMatchObject({ estado: 'sem_dado', motivo: 'sem_fonte_confiavel' });
    expect(ocup?.fato).toMatch(/ocupação não existe nos dados estruturados da SEC/);
  });

  it('fco_acao na janela 5: só AMH atende entre os 15 REITs (o caixa oscila com o capital de giro; aviso ao Pedro)', () => {
    const atendem = EMPRESAS.filter((e) => e.classe === 'reit').filter(
      (e) =>
        avaliarFixture(e).janelas['5'].resultados.find((r) => r.id === 'fco_acao')?.estado ===
        'atende',
    );
    expect(atendem.map((e) => e.symbol)).toEqual(['AMH']);
  });

  it("'luc' usa o lucro líquido (fallback, obs lucro_sem_descontado) e a fonte é 'sec'", () => {
    const a = avaliarFixture(EMPRESAS.find((e) => e.symbol === 'AAPL') as EmpresaFixture);
    const luc = a.janelas['5'].resultados.find((r) => r.id === 'luc');
    expect(luc?.obs).toEqual(['lucro_sem_descontado']);
    expect(luc?.fonte).toEqual(['sec']);
    expect(luc?.fato).toMatch(/\(US\$ mi\)$/);
  });

  it('dl dos REITs usa o limite de 6× e o das stocks o de 3×', () => {
    const o = avaliarFixture(EMPRESAS.find((e) => e.symbol === 'O') as EmpresaFixture);
    const aapl = avaliarFixture(EMPRESAS.find((e) => e.symbol === 'AAPL') as EmpresaFixture);
    expect(o.janelas['5'].resultados.find((r) => r.id === 'dl')?.fato).toMatch(/6,0×/);
    expect(aapl.janelas['5'].resultados.find((r) => r.id === 'dl')?.fato).toMatch(/3,0×/);
  });
});
