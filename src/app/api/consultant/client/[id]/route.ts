import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getClientSummary } from '@/services/consultantService';
import { getCashBalances, getMonthlyFlows } from '@/services/cashflow/clientCashflowSummary';
import { getAssetPrices } from '@/services/pricing/assetPriceService';
import { logConsultantAction } from '@/services/impersonationLogger';
import { authenticateConsultant, assertClientOwnership } from '@/utils/consultantAuth';

import { withErrorHandler } from '@/utils/apiErrorHandler';
const CACHE_CONTROL_HEADER = 'private, no-cache, no-store, must-revalidate';

const getClientBalances = async (clientId: string) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Entradas/despesas vêm da planilha; "investimentos" vem das compras reais
  // da carteira (o grupo de investimentos da planilha é derivado das mesmas
  // transações, injetado só no client).
  const [balances, totalAportes, monthAportes] = await Promise.all([
    getCashBalances(clientId),
    prisma.stockTransaction.aggregate({
      where: { userId: clientId, type: 'compra' },
      _sum: { total: true },
    }),
    prisma.stockTransaction.aggregate({
      where: { userId: clientId, type: 'compra', date: { gte: monthStart, lt: nextMonthStart } },
      _sum: { total: true },
    }),
  ]);

  return {
    total: { ...balances.total, investments: totalAportes._sum.total ?? 0 },
    monthly: { ...balances.monthly, investments: monthAportes._sum.total ?? 0 },
  };
};

const getClientPortfolio = async (clientId: string) => {
  const portfolio = await prisma.portfolio.findMany({
    where: { userId: clientId },
    include: {
      asset: true,
    },
  });

  if (portfolio.length === 0) {
    return {
      currentValue: 0,
      totalInvested: 0,
      assets: [],
    };
  }

  const symbols = portfolio
    .map((item) => item.asset?.symbol ?? null)
    .filter((symbol): symbol is string => Boolean(symbol));

  const quotes = await getAssetPrices(symbols, { useBrapiFallback: true });

  let currentValue = 0;
  let totalInvested = 0;

  const assets = portfolio.map((item) => {
    const inferredType = item.asset?.type ?? 'other';
    const invested = item.totalInvested ?? item.avgPrice * item.quantity;
    totalInvested += invested;

    const symbol = item.asset?.symbol;
    const currentPrice = symbol ? (quotes.get(symbol) ?? item.avgPrice) : item.avgPrice;
    const assetCurrentValue = currentPrice * item.quantity;
    currentValue += assetCurrentValue;

    return {
      id: item.id,
      symbol,
      name: item.asset?.name ?? symbol ?? '',
      type: inferredType,
      quantity: item.quantity,
      avgPrice: item.avgPrice,
      totalInvested: invested,
      currentPrice,
      currentValue: assetCurrentValue,
      profit: assetCurrentValue - invested,
      profitPercentage: invested > 0 ? ((assetCurrentValue - invested) / invested) * 100 : 0,
    };
  });

  return {
    currentValue,
    totalInvested,
    assets,
  };
};

const getClientRecentCashflows = async (clientId: string) => {
  // Movimentações recentes = aportes/resgates reais da carteira (o modelo
  // legado de lançamentos avulsos não tem mais UI e ficava sempre vazio).
  const movements = await prisma.stockTransaction.findMany({
    where: { userId: clientId },
    orderBy: { date: 'desc' },
    take: 5,
    select: {
      id: true,
      type: true,
      total: true,
      date: true,
      asset: { select: { symbol: true, name: true, type: true } },
    },
  });

  return movements.map((movement) => ({
    id: movement.id,
    type: movement.type.toLowerCase() === 'compra' ? 'Aporte' : 'Resgate',
    category: movement.asset?.type ?? 'carteira',
    description: movement.asset?.name ?? movement.asset?.symbol ?? 'Movimentação de carteira',
    value: movement.total,
    date: movement.date,
    paid: true,
  }));
};

const getClientMonthlyNetHistory = async (clientId: string, months = 12) => {
  const flows = await getMonthlyFlows(clientId, months);

  let cumulative = 0;
  return flows.map(({ date, net }) => {
    cumulative += net;
    return {
      month: date.toISOString(),
      net,
      cumulative,
    };
  });
};

export const GET = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const consultant = await authenticateConsultant(request);
    const { id: clientId } = await params;

    if (!clientId) {
      return NextResponse.json({ error: 'Cliente não informado' }, { status: 400 });
    }

    await assertClientOwnership(consultant.consultantId, clientId);

    // Registrar acesso ao detalhe do cliente
    await logConsultantAction({
      consultantId: consultant.userId,
      clientId,
      action: 'ACCESS_SENSITIVE_ENDPOINT',
      details: {
        endpoint: `/api/consultant/client/${clientId}`,
        method: 'GET',
        timestamp: new Date().toISOString(),
      },
      request,
    });

    const [summary, balances, portfolio, recentCashflows, monthlyNetHistory, clientProfile] =
      await Promise.all([
        getClientSummary(clientId),
        getClientBalances(clientId),
        getClientPortfolio(clientId),
        getClientRecentCashflows(clientId),
        getClientMonthlyNetHistory(clientId),
        prisma.user.findUnique({
          where: { id: clientId },
          select: {
            name: true,
            email: true,
          },
        }),
      ]);

    const indicators = summary
      ? {
          monthlyReturnPercentage: summary.monthlyReturnPercentage,
          totalAssets: summary.totalAssets,
          investmentsTotal: summary.investmentsTotal,
        }
      : null;

    return NextResponse.json(
      {
        clientId,
        summary,
        balances,
        portfolio,
        indicators,
        recentCashflows,
        monthlyNetHistory,
        client: clientProfile
          ? {
              name: clientProfile.name,
              email: clientProfile.email,
            }
          : null,
      },
      {
        headers: { 'Cache-Control': CACHE_CONTROL_HEADER },
      },
    );
  },
);
