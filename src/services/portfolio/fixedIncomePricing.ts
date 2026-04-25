import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  buildDailyTimeline,
  buildFixedIncomeFactorSeries,
  normalizeDateStart,
  type CdiDaily,
  type FixedIncomeAssetWithAsset,
  type IpcaMonthly,
  type TesouroPU,
} from './patrimonioHistoricoBuilder';

export type FixedIncomePricer = {
  getCurrentValue: (fi: FixedIncomeAssetWithAsset) => number;
  /**
   * Constrói a série diária de valores (`investedAmount * fator`) para o FI ao longo do
   * timeline informado. Útil para alimentar o histórico de patrimônio com marcação na curva
   * (CDI/IPCA/Tesouro PU) — caso contrário, CDBs 100% CDI ficariam estagnados no histórico.
   */
  buildValueSeriesForAsset: (
    fi: FixedIncomeAssetWithAsset,
    timeline: number[],
  ) => Array<{ date: number; value: number }>;
  fixedIncomeByAssetId: Map<string, FixedIncomeAssetWithAsset>;
  fixedIncomeAssets: FixedIncomeAssetWithAsset[];
};

const toFiHelper = (fi: FixedIncomeAssetWithAsset): FixedIncomeAssetWithAsset => ({
  id: fi.id,
  userId: fi.userId,
  assetId: fi.assetId,
  type: String(fi.type),
  description: fi.description,
  startDate: fi.startDate,
  maturityDate: fi.maturityDate,
  investedAmount: fi.investedAmount,
  annualRate: fi.annualRate,
  indexer: fi.indexer,
  indexerPercent: fi.indexerPercent,
  liquidityType: fi.liquidityType as string | null,
  taxExempt: fi.taxExempt,
  tesouroBondType: fi.tesouroBondType,
  tesouroMaturity: fi.tesouroMaturity,
  asset: fi.asset ?? null,
});

/**
 * Carrega séries CDI/IPCA/Tesouro PU necessárias para precificar todos os ativos de renda fixa
 * do usuário e devolve uma função que computa o valor atual de cada um aplicando o fator
 * acumulado correto. Reutiliza a mesma lógica usada pela aba Renda Fixa, garantindo que
 * CDBs/LCIs/LCAs/Tesouros sejam precificados consistentemente em qualquer aba.
 */
export const createFixedIncomePricer = async (
  userId: string,
  options?: { asOfDate?: Date; preloadedAssets?: FixedIncomeAssetWithAsset[] },
): Promise<FixedIncomePricer> => {
  const today = options?.asOfDate ?? new Date();

  let fixedIncomeAssets: FixedIncomeAssetWithAsset[] = options?.preloadedAssets ?? [];
  if (!options?.preloadedAssets) {
    try {
      fixedIncomeAssets = (await prisma.fixedIncomeAsset.findMany({
        where: { userId },
        include: { asset: true },
      })) as FixedIncomeAssetWithAsset[];
    } catch (error) {
      const prismaError = error as Prisma.PrismaClientKnownRequestError;
      if (prismaError?.code !== 'P2021') throw error;
      fixedIncomeAssets = [];
    }
  }

  const fixedIncomeByAssetId = new Map<string, FixedIncomeAssetWithAsset>();
  fixedIncomeAssets.forEach((fi) => fixedIncomeByAssetId.set(fi.assetId, fi));

  if (fixedIncomeAssets.length === 0) {
    return {
      getCurrentValue: (fi) => fi.investedAmount,
      buildValueSeriesForAsset: (fi, timeline) =>
        timeline.map((day) => ({ date: day, value: fi.investedAmount })),
      fixedIncomeByAssetId,
      fixedIncomeAssets,
    };
  }

  const earliestStart = fixedIncomeAssets.reduce<Date | null>((min, fi) => {
    const start = normalizeDateStart(new Date(fi.startDate));
    if (!min || start.getTime() < min.getTime()) return start;
    return min;
  }, null);

  const hasCdiLinked = fixedIncomeAssets.some(
    (fi) => fi.indexer === 'CDI' || Boolean(fi.tesouroBondType),
  );
  const hasIpcaLinked = fixedIncomeAssets.some(
    (fi) => fi.indexer === 'IPCA' || Boolean(fi.tesouroBondType),
  );
  const tesouroAssets = fixedIncomeAssets.filter((fi) => fi.tesouroBondType && fi.tesouroMaturity);

  // Resiliente a P2021 (tabela ausente em ambientes parciais) — sem isso uma falha em
  // economicIndex/tesouroDiretoPrice quebra qualquer rota que usa o pricer.
  const safeFindMany = async <T>(promiseFactory: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await promiseFactory();
    } catch (error) {
      const prismaError = error as Prisma.PrismaClientKnownRequestError;
      if (prismaError?.code === 'P2021') return [];
      throw error;
    }
  };

  const [cdiRows, ipcaRows, tesouroRows] = earliestStart
    ? await Promise.all([
        hasCdiLinked
          ? safeFindMany(() =>
              prisma.economicIndex.findMany({
                where: { indexType: 'CDI', date: { gte: earliestStart, lte: today } },
                orderBy: { date: 'asc' },
              }),
            )
          : Promise.resolve([] as Array<{ date: Date; value: unknown }>),
        hasIpcaLinked
          ? safeFindMany(() =>
              prisma.economicIndex.findMany({
                where: { indexType: 'IPCA', date: { gte: earliestStart, lte: today } },
                orderBy: { date: 'asc' },
              }),
            )
          : Promise.resolve([] as Array<{ date: Date; value: unknown }>),
        tesouroAssets.length > 0
          ? safeFindMany(() =>
              prisma.tesouroDiretoPrice.findMany({
                where: {
                  OR: tesouroAssets.map((fi) => ({
                    bondType: fi.tesouroBondType!,
                    maturityDate: fi.tesouroMaturity!,
                  })),
                  baseDate: { gte: earliestStart, lte: today },
                },
                orderBy: { baseDate: 'asc' },
              }),
            )
          : Promise.resolve(
              [] as Array<{
                bondType: string;
                maturityDate: Date;
                baseDate: Date;
                basePU: unknown;
                sellPU: unknown;
                buyPU: unknown;
              }>,
            ),
      ])
    : [[], [], []];

  const cdiGlobal: CdiDaily = new Map();
  cdiRows.forEach((row) => {
    const val = Number(row.value);
    if (Number.isFinite(val)) cdiGlobal.set(normalizeDateStart(row.date).getTime(), val);
  });

  const ipcaGlobal: IpcaMonthly = new Map();
  ipcaRows.forEach((row) => {
    const val = Number(row.value);
    if (!Number.isFinite(val)) return;
    const d = new Date(row.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    ipcaGlobal.set(key, val);
  });

  const tesouroPUByBond = new Map<string, TesouroPU>();
  tesouroRows.forEach((row) => {
    const pu = Number(row.basePU ?? 0) || Number(row.sellPU ?? 0) || Number(row.buyPU ?? 0);
    if (!Number.isFinite(pu) || pu <= 0) return;
    const key = `${row.bondType}|${row.maturityDate.toISOString()}`;
    let m = tesouroPUByBond.get(key);
    if (!m) {
      m = new Map();
      tesouroPUByBond.set(key, m);
    }
    m.set(normalizeDateStart(row.baseDate).getTime(), pu);
  });

  const getTesouroContext = (fi: FixedIncomeAssetWithAsset) => {
    if (!fi.tesouroBondType || !fi.tesouroMaturity)
      return { tesouroPU: undefined, tesouroPUAtStart: 0 };
    const key = `${fi.tesouroBondType}|${fi.tesouroMaturity.toISOString()}`;
    const tesouroPU = tesouroPUByBond.get(key);
    if (!tesouroPU) return { tesouroPU: undefined, tesouroPUAtStart: 0 };
    const startKey = normalizeDateStart(new Date(fi.startDate)).getTime();
    const sortedKeys = Array.from(tesouroPU.keys()).sort((a, b) => a - b);
    const atOrBefore = [...sortedKeys].reverse().find((k) => k <= startKey);
    const firstAfter = sortedKeys.find((k) => k >= startKey);
    const chosen = atOrBefore ?? firstAfter;
    return {
      tesouroPU,
      tesouroPUAtStart: chosen !== undefined ? (tesouroPU.get(chosen) ?? 0) : 0,
    };
  };

  const buildFactorSeries = (fi: FixedIncomeAssetWithAsset, timeline: number[]) => {
    const ctx = getTesouroContext(fi);
    return buildFixedIncomeFactorSeries(toFiHelper(fi), timeline, {
      cdi: cdiGlobal,
      ipca: ipcaGlobal,
      tesouroPU: ctx.tesouroPU,
      tesouroPUAtStart: ctx.tesouroPUAtStart,
    });
  };

  const getCurrentValue = (fixedIncome: FixedIncomeAssetWithAsset): number => {
    const start = normalizeDateStart(new Date(fixedIncome.startDate));
    const todayNorm = normalizeDateStart(today);
    if (todayNorm.getTime() <= start.getTime()) {
      return fixedIncome.investedAmount;
    }
    const timeline = buildDailyTimeline(start, todayNorm);
    if (timeline.length === 0) return fixedIncome.investedAmount;

    const factors = buildFactorSeries(fixedIncome, timeline);
    const lastDay = timeline[timeline.length - 1];
    const finalFactor = factors.get(lastDay) ?? 1;
    const valorAtual = fixedIncome.investedAmount * finalFactor;
    return Math.round(valorAtual * 100) / 100;
  };

  const buildValueSeriesForAsset = (fi: FixedIncomeAssetWithAsset, timeline: number[]) => {
    if (timeline.length === 0) return [] as Array<{ date: number; value: number }>;
    const factors = buildFactorSeries(fi, timeline);
    return timeline.map((day) => ({
      date: day,
      value: fi.investedAmount * (factors.get(day) ?? 1),
    }));
  };

  return {
    getCurrentValue,
    buildValueSeriesForAsset,
    fixedIncomeByAssetId,
    fixedIncomeAssets,
  };
};
