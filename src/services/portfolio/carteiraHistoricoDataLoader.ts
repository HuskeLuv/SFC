import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { filterInvestmentsExclReservas } from './patrimonioHistoricoBuilder';
import type {
  FixedIncomeAssetWithAsset,
  PortfolioWithRelations,
  StockTransactionWithRelations,
} from './patrimonioHistoricoBuilder';

/**
 * Carrega dados mínimos para buildPatrimonioHistorico (cron / resumo).
 * Usa selects enxutos onde possível para reduzir payload.
 */
export const loadCarteiraHistoricoData = async (targetUserId: string) => {
  const [
    portfolio,
    fixedIncomeResult,
    investmentGroupsTemplate,
    investmentGroupsCustom,
    stockTransactions,
  ] = await Promise.all([
    prisma.portfolio.findMany({
      where: { userId: targetUserId },
      include: { stock: true, asset: true },
    }) as Promise<PortfolioWithRelations[]>,
    (async (): Promise<FixedIncomeAssetWithAsset[]> => {
      try {
        return (await prisma.fixedIncomeAsset.findMany({
          where: { userId: targetUserId },
          include: { asset: true },
        })) as FixedIncomeAssetWithAsset[];
      } catch (error) {
        const prismaError = error as Prisma.PrismaClientKnownRequestError;
        if (prismaError?.code !== 'P2021') throw error;
        return [];
      }
    })(),
    prisma.cashflowGroup.findMany({
      where: { userId: null, type: 'investimento' },
      include: {
        items: {
          include: {
            values: {
              where: { userId: targetUserId, year: new Date().getFullYear() },
            },
          },
        },
      },
    }),
    prisma.cashflowGroup.findMany({
      where: { userId: targetUserId, type: 'investimento' },
      include: {
        items: {
          include: {
            values: {
              where: { userId: targetUserId, year: new Date().getFullYear() },
            },
          },
        },
      },
    }),
    prisma.stockTransaction.findMany({
      where: { userId: targetUserId },
      include: { stock: true, asset: true },
      orderBy: { date: 'asc' },
    }) as Promise<StockTransactionWithRelations[]>,
  ]);

  const allInvestmentGroups = [...investmentGroupsCustom];
  const templateMap = new Map(investmentGroupsTemplate.map((g) => [g.name, g]));
  investmentGroupsCustom.forEach((custom) => templateMap.delete(custom.name));
  allInvestmentGroups.push(...Array.from(templateMap.values()));

  const investments = allInvestmentGroups.flatMap((group) => group.items || []);
  const investmentsExclReservas = filterInvestmentsExclReservas(investments);

  return {
    portfolio,
    fixedIncomeAssets: fixedIncomeResult,
    stockTransactions,
    investmentsExclReservas,
  };
};
