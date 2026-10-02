import { describe, it, expect } from 'vitest';
import {
  montarGraficoAcao,
  montarGraficoFii,
  recortarJanela,
} from '@/services/analiseAtivos/leitura/ativo/seriesGrafico';

const HOJE = '2026-10-02';
// WEGE3 (dev): desdobramentos 2:1 em 2015 e 2021 e bonificação 30% em 2018, confirmados.
const EVENTOS_WEGE3 = [
  { dataEvento: '2015-04-01', fator: 2, status: 'confirmado' as const },
  { dataEvento: '2018-04-25', fator: 1.3, status: 'confirmado' as const },
  { dataEvento: '2021-04-28', fator: 2, status: 'confirmado' as const },
  { dataEvento: '2014-04-24', fator: 1.3, status: 'nao_validavel' as const },
];
const LPA_WEGE3 = [
  [2016, 0.2663],
  [2017, 0.2721],
  [2018, 0.3189],
  [2019, 0.3847],
  [2020, 0.558],
  [2021, 0.8546],
  [2022, 1.0029],
  [2023, 1.3662],
  [2024, 1.4402],
  [2025, 1.5197],
].map(([ano, lpaAjHoje]) => ({ ano, lpaAjHoje }));
// preço CRU de fim de ano (antes dos desdobramentos)
const PRECO_WEGE3 = [
  [2016, 15.5, '2016-12-29'],
  [2017, 24.11, '2017-12-28'],
  [2018, 17.54, '2018-12-28'],
  [2019, 34.66, '2019-12-30'],
  [2020, 75.74, '2020-12-30'],
  [2021, 32.98, '2021-12-30'],
  [2022, 38.51, '2022-12-29'],
  [2023, 36.91, '2023-12-28'],
  [2024, 52.77, '2024-12-30'],
  [2025, 48.51, '2025-12-30'],
].map(([ano, preco, data]) => ({
  ano: ano as number,
  preco: preco as number,
  data: data as string,
}));

function wege() {
  return montarGraficoAcao({
    hoje: HOJE,
    lpaAnual: [...LPA_WEGE3, { ano: 2026, lpaAjHoje: 1.2 }],
    precoAnual: PRECO_WEGE3,
    eventos: EVENTOS_WEGE3,
    lpaTtm: 1.4905,
    precoAtual: 50.29,
  });
}

describe('montarGraficoAcao', () => {
  it('só anos fechados (2026 fora) e ponto últ. 12m separado', () => {
    const g = wege();
    expect(g.serieA.pontos.map((p) => p.chave)).toEqual([
      '2016',
      '2017',
      '2018',
      '2019',
      '2020',
      '2021',
      '2022',
      '2023',
      '2024',
      '2025',
    ]);
    expect(g.ult12m).toEqual({ a: 1.4905, b: 50.29 });
    expect(g.periodos).toEqual(['5A', '10A']);
    expect(g.insuficiente).toBe(false);
  });

  it('WEGE3 sem degrau de desdobramento: 2020 → 2021 cai de forma contínua (≈ −13%), não pela metade', () => {
    const b = wege().serieB.pontos;
    const v2020 = b.find((p) => p.chave === '2020')!.valor!;
    const v2021 = b.find((p) => p.chave === '2021')!.valor!;
    expect(v2020).toBeCloseTo(37.87, 2); // 75,74 ÷ 2 (desdobramento de 2021)
    expect(v2021 / v2020).toBeGreaterThan(0.8);
    // 2016: ÷ 2 (2021) ÷ 1,3 (2018); o evento não validável não entra
    expect(b[0].valor).toBeCloseTo(15.5 / 2.6, 4);
  });

  it('prejuízo vira lacuna com nota', () => {
    const g = montarGraficoAcao({
      hoje: HOJE,
      lpaAnual: [
        { ano: 2021, lpaAjHoje: 0.15 },
        { ano: 2022, lpaAjHoje: 2.67 },
        { ano: 2023, lpaAjHoje: -0.32 },
        { ano: 2024, lpaAjHoje: 0.24 },
        { ano: 2025, lpaAjHoje: -0.64 },
      ],
      precoAnual: [2021, 2022, 2023, 2024, 2025].map((ano) => ({
        ano,
        preco: 14,
        data: `${ano}-12-30`,
      })),
      eventos: [],
      lpaTtm: -1.04,
      precoAtual: 12.69,
    });
    expect(g.lacunas.map((l) => l.chave)).toEqual(['2023', '2025']);
    expect(g.lacunas[0].texto).toBe('prejuízo no ano: ponto fora do gráfico');
    expect(g.serieA.pontos.find((p) => p.chave === '2023')!.valor).toBeNull();
    expect(g.ult12m).toEqual({ a: null, b: 12.69 });
  });

  it('menos de 3 pontos completos = insuficiente', () => {
    const g = montarGraficoAcao({
      hoje: HOJE,
      lpaAnual: [
        { ano: 2024, lpaAjHoje: 1 },
        { ano: 2025, lpaAjHoje: 1.1 },
      ],
      precoAnual: [
        { ano: 2024, preco: 10, data: '2024-12-30' },
        { ano: 2025, preco: 11, data: '2025-12-30' },
      ],
      eventos: [],
      lpaTtm: null,
      precoAtual: null,
    });
    expect(g.insuficiente).toBe(true);
  });
});

describe('recortarJanela (base 100 no cliente)', () => {
  it('10A: as duas séries começam em 100 no primeiro ano; últ. 12m na mesma base', () => {
    const j = recortarJanela(wege(), '10A');
    expect(j.pontos).toHaveLength(10);
    expect(j.base).toBe('2016');
    expect(j.pontos[0].a100).toBeCloseTo(100, 6);
    expect(j.pontos[0].b100).toBeCloseTo(100, 6);
    expect(j.pontos[9].a100).toBeCloseTo((1.5197 / 0.2663) * 100, 3);
    expect(j.ult12m?.a100).toBeCloseTo((1.4905 / 0.2663) * 100, 3);
  });

  it('5A: rebaseia no primeiro ano da janela (2021)', () => {
    const j = recortarJanela(wege(), '5A');
    expect(j.pontos.map((p) => p.chave)).toEqual(['2021', '2022', '2023', '2024', '2025']);
    expect(j.pontos[0].a100).toBeCloseTo(100, 6);
    expect(j.pontos[0].b100).toBeCloseTo(100, 6);
  });
});

describe('montarGraficoFii', () => {
  it('mensal: VP/cota e cota ajustados pelo desdobramento (HGLG11 1:10 em abr/2018)', () => {
    const g = montarGraficoFii({
      hoje: HOJE,
      mensal: [
        { refMonth: '2018-03-01', vpCota: 1173.48 },
        { refMonth: '2018-04-01', vpCota: 116.99 },
        { refMonth: '2018-05-01', vpCota: 116.42 },
      ],
      cotacaoMensal: [
        { data: '2018-03-29', close: 1503.77 },
        { data: '2018-05-30', close: 125 },
      ],
      eventos: [{ dataEvento: '2018-04-18', fator: 10, status: 'confirmado' }],
    });
    expect(g.granularidade).toBe('mensal');
    expect(g.serieA.pontos.map((p) => p.valor)).toEqual([117.348, 116.99, 116.42]);
    expect(g.serieB.pontos[0].valor).toBeCloseTo(150.377, 3);
    expect(g.serieB.pontos[1].valor).toBeNull();
    expect(g.ult12m).toBeNull();
  });
});
