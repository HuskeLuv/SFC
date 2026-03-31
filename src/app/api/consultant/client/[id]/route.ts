import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getClientSummary } from '@/services/consultantService';
import { getAssetPrices } from '@/services/pricing/assetPriceService';
import { logConsultantAction } from '@/services/impersonationLogger';
import { authenticateConsultant, assertClientOwnership } from '@/utils/consultantAuth';

import { withErrorHandler } from '@/utils/apiErrorHandler';
const CACHE_CONTROL_HEADER = 'private, no-cache, no-store, must-revalidate';

const getClientBalances = async (clientId: string) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [overall, monthly] = await Promise.all([
    prisma.cashflow.groupBy({
      by: ['tipo'],
      where: { userId: clientId },
      _sum: { valor: true },
    }),
    prisma.cashflow.groupBy({
      by: ['tipo'],
      where: {
        userId: clientId,
        data: {
          gte: monthStart,
          lt: nextMonthStart,
        },
      },
      _sum: { valor: true },
    }),
  ]);

  const summarize = (entries: { tipo: string; _sum: { valor: number | null } }[]) => {
    const income = entries
      .filter((entry) => entry.tipo.toLowerCase() === 'receita')
      .reduce((acc, entry) => acc + (entry._sum.valor ?? 0), 0);

    const expenses = entries
      .filter((entry) => entry.tipo.toLowerCase() === 'despesa')
      .reduce((acc, entry) => acc + (entry._sum.valor ?? 0), 0);

    const investments = entries
      .filter((entry) => entry.tipo.toLowerCase() === 'investimento')
      .reduce((acc, entry) => acc + (entry._sum.valor ?? 0), 0);

    return {
      income,
      expenses,
      investments,
      net: income - expenses,
    };
  };

  return {
    total: summarize(overall),
    monthly: summarize(monthly),
  };
};

const getClientPortfolio = async (clientId: string) => {
  const portfolio = await prisma.portfolio.findMany({
    where: { userId: clientId },
    include: {
      asset: true,
      stock: true,
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
    .map((item) => item.asset?.symbol ?? item.stock?.ticker ?? null)
    .filter((symbol): symbol is string => Boolean(symbol));

  const quotes = await getAssetPrices(symbols, { useBrapiFallback: true });

  let currentValue = 0;
  let totalInvested = 0;

  const assets = portfolio.map((item) => {
    const inferredType = item.asset?.type ?? (item.stock ? 'stock' : 'other');
    const invested = item.totalInvested ?? item.avgPrice * item.quantity;
    totalInvested += invested;

    const symbol = item.asset?.symbol ?? item.stock?.ticker;
    const currentPrice = symbol ? (quotes.get(symbol) ?? item.avgPrice) : item.avgPrice;
    const assetCurrentValue = currentPrice * item.quantity;
    currentValue += assetCurrentValue;

    return {
      id: item.id,
      symbol,
      name: item.asset?.name ?? item.stock?.companyName ?? symbol ?? '',
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
  const movements = await prisma.cashflow.findMany({
    where: { userId: clientId },
    orderBy: { data: 'desc' },
    take: 5,
  });

  return movements.map((movement) => ({
    id: movement.id,
    type: movement.tipo,
    category: movement.categoria,
    description: movement.descricao,
    value: movement.valor,
    date: movement.data,
    paid: movement.pago,
  }));
};

const getClientMonthlyNetHistory = async (clientId: string, months = 12) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const movements = await prisma.cashflow.findMany({
    where: {
      userId: clientId,
      data: {
        gte: start,
      },
    },
    select: {
      data: true,
      valor: true,
      tipo: true,
    },
    orderBy: {
      data: 'asc',
    },
  });

  const monthMap = new Map<
    string,
    {
      date: Date;
      net: number;
    }
  >();

  movements.forEach((movement) => {
    const monthDate = new Date(movement.data.getFullYear(), movement.data.getMonth(), 1);
    const key = monthDate.toISOString();
    const normalizedType = movement.tipo?.toLowerCase?.() ?? '';
    const isExpense = normalizedType.includes('desp') || normalizedType.includes('saida');
    const signedValue = isExpense ? -movement.valor : movement.valor;
    const entry = monthMap.get(key);
    if (entry) {
      entry.net += signedValue;
    } else {
      monthMap.set(key, {
        date: monthDate,
        net: signedValue,
      });
    }
  });

  for (let offset = 0; offset < months; offset += 1) {
    const monthDate = new Date(start.getFullYear(), start.getMonth() + offset, 1);
    const key = monthDate.toISOString();
    if (!monthMap.has(key)) {
      monthMap.set(key, { date: monthDate, net: 0 });
    }
  }

  const ordered = Array.from(monthMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

  let cumulative = 0;
  return ordered.map(({ date, net }) => {
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
