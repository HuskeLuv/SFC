import { describe, it, expect, vi } from 'vitest';

const mockGetAssetHistory = vi.hoisted(() => vi.fn());

vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetHistory: mockGetAssetHistory,
}));

import {
  buildDailyTimeline,
  buildFixedIncomeFactorSeries,
  normalizeDateStart,
  type FixedIncomeAssetWithAsset,
  type CdiDaily,
  type IpcaMonthly,
  type TesouroPU,
} from '../patrimonioHistoricoBuilder';

const makeFi = (overrides: Partial<FixedIncomeAssetWithAsset> = {}): FixedIncomeAssetWithAsset => ({
  id: 'fi-1',
  userId: 'user-1',
  assetId: 'asset-1',
  type: 'CDB_PRE',
  description: 'CDB Teste',
  startDate: new Date(2025, 0, 2), // 2025-01-02 (quinta-feira)
  maturityDate: new Date(2030, 0, 2),
  investedAmount: 1000,
  annualRate: 12,
  indexer: 'PRE',
  indexerPercent: null,
  liquidityType: 'MATURITY',
  taxExempt: false,
  asset: { symbol: 'RENDA-FIXA-FI-1', name: 'CDB Teste', type: 'renda-fixa' },
  ...overrides,
});

const nthBusinessDay = (start: Date, n: number): number => {
  const timeline = buildDailyTimeline(start, new Date(start.getTime() + n * 2 * 24 * 3600 * 1000));
  return timeline[n];
};

describe('buildFixedIncomeFactorSeries', () => {
  it('PRE 12% a.a. — fator cresce suave e aproxima 1.12 após 252 dias úteis', () => {
    const start = new Date(2025, 0, 2);
    const fi = makeFi({ startDate: start, annualRate: 12, indexer: 'PRE' });
    // Gera timeline cobrindo ~380 dias corridos (~252 dias úteis)
    const endDate = new Date(start.getTime() + 380 * 24 * 3600 * 1000);
    const timeline = buildDailyTimeline(start, endDate);
    expect(timeline.length).toBeGreaterThanOrEqual(252);

    const factors = buildFixedIncomeFactorSeries(fi, timeline);

    // Dia 0: sem acréscimo
    expect(factors.get(timeline[0])).toBeCloseTo(1, 10);
    // Dia 1: (1.12)^(1/252)
    expect(factors.get(timeline[1])).toBeCloseTo(Math.pow(1.12, 1 / 252), 10);
    // Após 252 dias úteis: ~1.12
    expect(factors.get(timeline[252])).toBeCloseTo(1.12, 5);
  });

  it('CDI 100% — compõe CDI diário constante', () => {
    const start = new Date(2025, 0, 2);
    const fi = makeFi({ startDate: start, annualRate: 0, indexer: 'CDI', indexerPercent: 100 });
    const timeline = buildDailyTimeline(start, new Date(start.getTime() + 45 * 24 * 3600 * 1000));

    const cdi: CdiDaily = new Map();
    for (const day of timeline) cdi.set(day, 0.0005);

    const factors = buildFixedIncomeFactorSeries(fi, timeline, { cdi });
    // 22 dias úteis compostos até timeline[21] inclusive (D+0 conta — CDI
    // do dia da aplicação incide).
    const expected = Math.pow(1.0005, 22);
    expect(factors.get(timeline[21])).toBeCloseTo(expected, 10);
  });

  it('CDI 110% — rende mais que 100% CDI no mesmo período', () => {
    const start = new Date(2025, 0, 2);
    const timeline = buildDailyTimeline(start, new Date(start.getTime() + 45 * 24 * 3600 * 1000));
    const cdi: CdiDaily = new Map();
    for (const day of timeline) cdi.set(day, 0.0005);

    const factors100 = buildFixedIncomeFactorSeries(
      makeFi({ startDate: start, annualRate: 0, indexer: 'CDI', indexerPercent: 100 }),
      timeline,
      { cdi },
    );
    const factors110 = buildFixedIncomeFactorSeries(
      makeFi({ startDate: start, annualRate: 0, indexer: 'CDI', indexerPercent: 110 }),
      timeline,
      { cdi },
    );

    const expected110 = Math.pow(1 + 0.0005 * 1.1, 22);
    expect(factors110.get(timeline[21])).toBeCloseTo(expected110, 10);
    expect(factors110.get(timeline[21])!).toBeGreaterThan(factors100.get(timeline[21])!);
  });

  it('CDI — compõe no próprio dia da aplicação (D+0)', () => {
    // CDB BMG comprado hoje rende a taxa do CDI de hoje. Sem isso, o user
    // veria saldo "estagnado" até o dia útil seguinte (gap visual).
    const start = new Date(2025, 0, 2);
    const fi = makeFi({ startDate: start, annualRate: 0, indexer: 'CDI', indexerPercent: 100 });
    const timeline = buildDailyTimeline(start, new Date(start.getTime() + 5 * 24 * 3600 * 1000));
    const cdi: CdiDaily = new Map();
    cdi.set(timeline[0], 0.0005); // CDI publicado para o startDay

    const factors = buildFixedIncomeFactorSeries(fi, timeline, { cdi });
    expect(factors.get(timeline[0])).toBeCloseTo(1.0005, 10);
  });

  it('PRE no startDay — segue D+1 (não compõe no próprio dia)', () => {
    // Convenção D+1 mantida para PRE/IPCA: o ganho começa no dia útil seguinte.
    // Só CDI passa a aplicar D+0 (alinhamento com Kinvo + BACEN publica D+1).
    const start = new Date(2025, 0, 2);
    const fi = makeFi({ startDate: start, annualRate: 12, indexer: 'PRE' });
    const timeline = buildDailyTimeline(start, new Date(start.getTime() + 5 * 24 * 3600 * 1000));
    const factors = buildFixedIncomeFactorSeries(fi, timeline);
    expect(factors.get(timeline[0])).toBeCloseTo(1, 10);
    expect(factors.get(timeline[1])).toBeCloseTo(Math.pow(1.12, 1 / 252), 10);
  });

  it('CDI — não compõe em dias sem dado (feriados/gaps do BACEN)', () => {
    const start = new Date(2025, 0, 2);
    const timeline = buildDailyTimeline(start, new Date(start.getTime() + 20 * 24 * 3600 * 1000));
    const fi = makeFi({ startDate: start, annualRate: 0, indexer: 'CDI', indexerPercent: 100 });
    // Define CDI apenas no segundo dia útil; os demais ficam sem dado
    const cdi: CdiDaily = new Map();
    cdi.set(timeline[1], 0.0005);

    const factors = buildFixedIncomeFactorSeries(fi, timeline, { cdi });

    // Dia 1: aplica 0.0005
    expect(factors.get(timeline[1])).toBeCloseTo(1.0005, 10);
    // Dia 2 em diante: BACEN não publicou — fator permanece em 1.0005 (sem nova
    // composição). Carregar o lastCdi nesses dias inflava o saldo em ~2,5%/5 anos
    // por causa de feriados nacionais.
    expect(factors.get(timeline[2])).toBeCloseTo(1.0005, 10);
    expect(factors.get(timeline[5])).toBeCloseTo(1.0005, 10);
  });

  it('IPCA + 5% a.a. — aplica IPCA ao cruzar de mês e spread prefixado diariamente', () => {
    const start = new Date(2025, 0, 2); // jan/2025
    const fi = makeFi({ startDate: start, annualRate: 5, indexer: 'IPCA' });
    // Timeline vai até ~meio de fevereiro para garantir cruzamento de mês
    const endDate = new Date(2025, 1, 15);
    const timeline = buildDailyTimeline(start, endDate);

    const ipca: IpcaMonthly = new Map([['2025-01', 0.005]]);
    const factors = buildFixedIncomeFactorSeries(fi, timeline, { ipca });

    // Encontra o primeiro dia útil de fevereiro na timeline
    const firstFebIdx = timeline.findIndex((d) => new Date(d).getMonth() === 1);
    expect(firstFebIdx).toBeGreaterThan(0);

    // No primeiro dia útil de fevereiro: IPCA de jan já foi aplicado + spread dos N dias úteis
    const daysUntilFeb = firstFebIdx; // número de acréscimos diários de spread aplicados
    const expected = 1.005 * Math.pow(Math.pow(1.05, 1 / 252), daysUntilFeb);
    expect(factors.get(timeline[firstFebIdx])).toBeCloseTo(expected, 8);
  });

  it('IPCA sem rate conhecido — aplica apenas spread prefixado, não quebra', () => {
    const start = new Date(2025, 0, 2);
    const fi = makeFi({ startDate: start, annualRate: 5, indexer: 'IPCA' });
    const timeline = buildDailyTimeline(start, new Date(2025, 1, 15));

    const factors = buildFixedIncomeFactorSeries(fi, timeline, { ipca: new Map() });
    // Sem IPCA disponível, cresce pelo spread somente
    const lastIdx = timeline.length - 1;
    const expected = Math.pow(Math.pow(1.05, 1 / 252), lastIdx);
    expect(factors.get(timeline[lastIdx])).toBeCloseTo(expected, 8);
  });

  it('Tesouro com PU — usa razão pu_dia / pu_start', () => {
    const start = new Date(2025, 0, 2);
    const fi = makeFi({
      startDate: start,
      indexer: 'PRE',
      annualRate: 10,
      tesouroBondType: 'Tesouro Selic',
      tesouroMaturity: new Date(2030, 0, 2),
    } as Partial<FixedIncomeAssetWithAsset>);
    const timeline = buildDailyTimeline(start, new Date(start.getTime() + 30 * 24 * 3600 * 1000));

    const tesouroPU: TesouroPU = new Map();
    tesouroPU.set(timeline[0], 1000);
    tesouroPU.set(timeline[10], 1100);
    // Dias intermediários: sem dado (carry forward)

    const factors = buildFixedIncomeFactorSeries(fi, timeline, {
      tesouroPU,
      tesouroPUAtStart: 1000,
    });

    expect(factors.get(timeline[0])).toBeCloseTo(1, 10);
    // Até o dia 9 carrega PU=1000 → fator=1
    expect(factors.get(timeline[9])).toBeCloseTo(1, 10);
    // No dia 10: PU=1100 → fator=1.10
    expect(factors.get(timeline[10])).toBeCloseTo(1.1, 10);
    // Dia 15 (sem PU publicado): carrega o último (1100) → fator=1.10
    expect(factors.get(timeline[15])).toBeCloseTo(1.1, 10);
  });

  it('Tesouro sem PU no início — cai para fórmula pelo indexer do registro', () => {
    const start = new Date(2025, 0, 2);
    const fi = makeFi({
      startDate: start,
      indexer: 'PRE',
      annualRate: 12,
      tesouroBondType: 'Tesouro Prefixado',
      tesouroMaturity: new Date(2030, 0, 2),
    } as Partial<FixedIncomeAssetWithAsset>);
    const timeline = buildDailyTimeline(start, new Date(start.getTime() + 30 * 24 * 3600 * 1000));

    const factors = buildFixedIncomeFactorSeries(fi, timeline, {
      tesouroPU: new Map(),
      // Sem tesouroPUAtStart → fallback para fórmula PRE
    });

    // Deve crescer como PRE 12% a.a.
    expect(factors.get(timeline[1])).toBeCloseTo(Math.pow(1.12, 1 / 252), 10);
  });

  it('Vencimento no passado — fator congelado no vencimento', () => {
    const start = new Date(2025, 0, 2);
    const maturity = new Date(2025, 2, 3); // ~2 meses depois
    const fi = makeFi({ startDate: start, maturityDate: maturity, annualRate: 12, indexer: 'PRE' });
    // Timeline estende muito além do vencimento
    const timeline = buildDailyTimeline(start, new Date(2025, 11, 31));

    const factors = buildFixedIncomeFactorSeries(fi, timeline);

    const maturityKey = normalizeDateStart(maturity).getTime();
    // Encontra o último dia útil <= maturity
    const lastBeforeMaturity = [...timeline].filter((d) => d <= maturityKey).pop()!;
    const frozen = factors.get(lastBeforeMaturity)!;

    // Um dia útil após vencimento: fator igual ao da data de vencimento
    const firstAfter = timeline.find((d) => d > maturityKey)!;
    expect(factors.get(firstAfter)).toBeCloseTo(frozen, 10);
    // Muito depois: idem
    expect(factors.get(timeline[timeline.length - 1])).toBeCloseTo(frozen, 10);
  });

  it('indexerPercent null em CDI — trata como 100%', () => {
    const start = new Date(2025, 0, 2);
    const timeline = buildDailyTimeline(start, new Date(start.getTime() + 20 * 24 * 3600 * 1000));
    const cdi: CdiDaily = new Map();
    for (const day of timeline) cdi.set(day, 0.0005);

    const factors = buildFixedIncomeFactorSeries(
      makeFi({ startDate: start, annualRate: 0, indexer: 'CDI', indexerPercent: null }),
      timeline,
      { cdi },
    );
    expect(factors.get(timeline[10])).toBeCloseTo(Math.pow(1.0005, 11), 10);
  });

  it('Timeline vazio — retorna mapa vazio', () => {
    const fi = makeFi();
    const factors = buildFixedIncomeFactorSeries(fi, []);
    expect(factors.size).toBe(0);
  });

  it('Dias antes da aplicação — fator = 1', () => {
    const start = new Date(2025, 1, 15); // investimento em fev
    const fi = makeFi({ startDate: start, annualRate: 12, indexer: 'PRE' });
    const timeline = buildDailyTimeline(new Date(2025, 0, 2), new Date(2025, 2, 15));

    const factors = buildFixedIncomeFactorSeries(fi, timeline);
    const startKey = normalizeDateStart(start).getTime();
    timeline
      .filter((d) => d < startKey)
      .forEach((d) => {
        expect(factors.get(d)).toBe(1);
      });
  });

  it('Timeline truncado (start antes do timeline) — factor acumula do startDate, não do timeline[0]', () => {
    // Aplicação em 2023; timeline pedido só cobre 2025 em diante (ex.: maxHistoricoMonths
    // truncou o histórico). O fator do PRIMEIRO dia do timeline deve refletir os ~2 anos
    // de rentabilidade pré-timeline — não pode resetar em 1.
    const startDate = new Date(2023, 0, 2);
    const fi = makeFi({ startDate, annualRate: 12, indexer: 'PRE' });
    const truncatedStart = new Date(2025, 0, 2);
    const truncatedEnd = new Date(2025, 2, 31);
    const timeline = buildDailyTimeline(truncatedStart, truncatedEnd);

    const factors = buildFixedIncomeFactorSeries(fi, timeline);

    // Como referência: factor com timeline COMPLETO (de startDate até truncatedEnd).
    const fullTimeline = buildDailyTimeline(startDate, truncatedEnd);
    const fullFactors = buildFixedIncomeFactorSeries(fi, fullTimeline);

    // Factor no primeiro dia do timeline truncado deve ser igual ao do timeline completo
    // naquele mesmo dia (ou seja, refletindo os ~2 anos de PRE acumulados antes).
    const firstDayKey = timeline[0];
    expect(factors.get(firstDayKey)).toBeCloseTo(fullFactors.get(firstDayKey)!, 8);
    expect(factors.get(firstDayKey)!).toBeGreaterThan(1.2); // ~2 anos a 12% a.a.

    // Factor no último dia também deve coincidir com o timeline completo.
    const lastDayKey = timeline[timeline.length - 1];
    expect(factors.get(lastDayKey)).toBeCloseTo(fullFactors.get(lastDayKey)!, 8);

    // Resultado contém apenas dias do timeline solicitado, não os dias intermediários.
    expect(factors.size).toBe(timeline.length);
  });
});

// Mantém referência para evitar TS warning de import não usado em alguns cenários
void nthBusinessDay;
