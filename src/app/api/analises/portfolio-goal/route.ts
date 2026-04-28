import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import {
  filterInvestmentsExclReservas,
  type FixedIncomeAssetWithAsset,
} from '@/services/portfolio/patrimonioHistoricoBuilder';
import { createFixedIncomePricer } from '@/services/portfolio/fixedIncomePricing';
import { computePortfolioLiveTotals } from '@/services/portfolio/portfolioLiveTotals';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';

/**
 * Meta de patrimônio do usuário: "atingir R$ X até dezembro do ano Y".
 * Singleton por userId — só existe uma meta ativa.
 *
 * Lacuna no SFC identificada na comparação com Kinvo
 * (/v2/portfolio-goals/simpleEquityGoal/getPortfolioGoalStatus).
 */

const goalSchema = z.object({
  targetEquity: z.number().positive().finite(),
  targetYear: z
    .number()
    .int()
    .min(new Date().getFullYear())
    .max(new Date().getFullYear() + 100),
});

interface GoalStatus {
  hasGoal: boolean;
  targetEquity: number | null;
  targetYear: number | null;
  currentEquity: number;
  progressPercent: number;
  monthsRemaining: number;
  monthlyContributionNeeded: number;
  isAchieved: boolean;
}

async function computeCurrentEquity(targetUserId: string): Promise<number> {
  const [portfolio, investmentGroups, fixedIncomeAssets] = await Promise.all([
    prisma.portfolio.findMany({
      where: { userId: targetUserId },
      include: { stock: true, asset: true },
    }),
    prisma.cashflowGroup.findMany({
      where: { userId: targetUserId, type: 'investimento' },
      include: { items: { include: { values: true } } },
    }),
    prisma.fixedIncomeAsset.findMany({
      where: { userId: targetUserId },
      include: { asset: true },
    }),
  ]);

  const cashflowInvestments = filterInvestmentsExclReservas(
    investmentGroups.flatMap((g) => g.items || []),
  );
  const fiPricer = await createFixedIncomePricer(targetUserId, {
    preloadedAssets: fixedIncomeAssets as unknown as FixedIncomeAssetWithAsset[],
  });
  const { saldoBruto } = await computePortfolioLiveTotals({
    portfolio,
    fixedIncomeAssets: fixedIncomeAssets as unknown as FixedIncomeAssetWithAsset[],
    investmentsExclReservas: cashflowInvestments,
    fiPricer,
  });
  return saldoBruto;
}

/**
 * Constrói o status da meta. Cronograma assume dezembro do `targetYear` como deadline,
 * meses restantes contados em meses inteiros (truncado, não arredondado).
 */
function buildStatus(
  goal: { targetEquity: number; targetYear: number } | null,
  currentEquity: number,
): GoalStatus {
  if (!goal) {
    return {
      hasGoal: false,
      targetEquity: null,
      targetYear: null,
      currentEquity: Math.round(currentEquity * 100) / 100,
      progressPercent: 0,
      monthsRemaining: 0,
      monthlyContributionNeeded: 0,
      isAchieved: false,
    };
  }

  const target = goal.targetEquity;
  const progress = target > 0 ? (currentEquity / target) * 100 : 0;
  const isAchieved = currentEquity >= target;

  // Deadline = dezembro do targetYear (último dia do mês).
  const today = new Date();
  const deadline = new Date(goal.targetYear, 11, 31, 23, 59, 59);
  const monthsRemaining = Math.max(
    0,
    (deadline.getFullYear() - today.getFullYear()) * 12 + (deadline.getMonth() - today.getMonth()),
  );

  // Contribuição mensal restante = gap / mesesRestantes (não considera valorização de capital).
  // Útil como referência simples; cálculo financeiro com juros compostos pode ser exposto depois.
  const gap = Math.max(0, target - currentEquity);
  const monthlyContributionNeeded = monthsRemaining > 0 ? gap / monthsRemaining : gap;

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    hasGoal: true,
    targetEquity: round(target),
    targetYear: goal.targetYear,
    currentEquity: round(currentEquity),
    progressPercent: round(Math.min(100, progress)),
    monthsRemaining,
    monthlyContributionNeeded: round(monthlyContributionNeeded),
    isAchieved,
  };
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const [goalRow, currentEquity] = await Promise.all([
    prisma.portfolioGoal.findUnique({ where: { userId: targetUserId } }),
    computeCurrentEquity(targetUserId),
  ]);

  const goal = goalRow
    ? { targetEquity: Number(goalRow.targetEquity), targetYear: goalRow.targetYear }
    : null;

  return NextResponse.json(buildStatus(goal, currentEquity));
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const body = await request.json();
  const parsed = goalSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const { targetEquity, targetYear } = parsed.data;

  const goalRow = await prisma.portfolioGoal.upsert({
    where: { userId: targetUserId },
    update: { targetEquity, targetYear },
    create: { userId: targetUserId, targetEquity, targetYear },
  });

  const currentEquity = await computeCurrentEquity(targetUserId);
  return NextResponse.json(
    buildStatus(
      { targetEquity: Number(goalRow.targetEquity), targetYear: goalRow.targetYear },
      currentEquity,
    ),
  );
});

export const DELETE = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  await prisma.portfolioGoal.deleteMany({ where: { userId: targetUserId } });

  const currentEquity = await computeCurrentEquity(targetUserId);
  return NextResponse.json(buildStatus(null, currentEquity));
});
