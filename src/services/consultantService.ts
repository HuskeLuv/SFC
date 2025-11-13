import { ConsultantClientStatus, UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { fetchQuotes } from '@/services/brapiQuote';

export interface ConsultantClientDescriptor {
  id: string;
  clientId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  status: ConsultantClientStatus;
  createdAt: Date;
}

export interface ClientSummary {
  currentBalance: number;
  investmentsTotal: number;
  monthlyReturnPercentage: number;
  totalAssets: number;
}

export interface ConsultantOverview {
  totalClients: number;
  totalActiveClients: number;
  totalManagedAssets: number;
  averageClientReturn: number;
}

const roundTwoDecimals = (value: number) => Math.round(value * 100) / 100;

const normalizeConsultantId = async (consultantId: string) => {
  if (!consultantId) {
    return null;
  }

  const consultant = await prisma.consultant.findFirst({
    where: {
      OR: [
        { id: consultantId },
        { userId: consultantId },
      ],
    },
    include: {
      user: true,
      clients: {
        include: {
          client: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  return consultant ?? null;
};

const calculatePortfolioSnapshot = async (clientId: string) => {
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
      totalAssets: 0,
    };
  }

  const symbols = portfolio
    .map((item) => item.asset?.symbol ?? item.stock?.ticker ?? null)
    .filter((symbol): symbol is string => Boolean(symbol));

  const quotes = await fetchQuotes(symbols);

  let currentValue = 0;
  let totalInvested = 0;

  for (const item of portfolio) {
    const invested = item.totalInvested ?? item.avgPrice * item.quantity;
    totalInvested += invested;

    const symbol = item.asset?.symbol ?? item.stock?.ticker;
    if (!symbol) {
      currentValue += invested;
      continue;
    }

    const currentPrice = quotes.get(symbol);
    if (!currentPrice) {
      currentValue += invested;
      continue;
    }

    currentValue += currentPrice * item.quantity;
  }

  return {
    currentValue,
    totalInvested,
    totalAssets: portfolio.length,
  };
};

const calculateCashBalances = async (clientId: string) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [totalCashflow, monthlyCashflow] = await Promise.all([
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

  const resolveTotals = (entries: { tipo: string; _sum: { valor: number | null } }[]) => {
    const income = entries
      .filter((entry) => entry.tipo.toLowerCase() === 'receita')
      .reduce((total, entry) => total + (entry._sum.valor ?? 0), 0);
    const expenses = entries
      .filter((entry) => entry.tipo.toLowerCase() === 'despesa')
      .reduce((total, entry) => total + (entry._sum.valor ?? 0), 0);
    return {
      income,
      expenses,
      net: income - expenses,
    };
  };

  return {
    total: resolveTotals(totalCashflow),
    monthly: resolveTotals(monthlyCashflow),
  };
};

export const getClientsByConsultant = async (consultantId: string): Promise<ConsultantClientDescriptor[]> => {
  const consultant = await normalizeConsultantId(consultantId);
  if (!consultant) {
    return [];
  }

  return consultant.clients.map((assignment) => ({
    id: assignment.id,
    clientId: assignment.clientId,
    name: assignment.client?.name ?? 'Cliente sem nome',
    email: assignment.client?.email ?? '',
    avatarUrl: assignment.client?.avatarUrl,
    status: assignment.status,
    createdAt: assignment.createdAt,
  }));
};

export const getClientSummary = async (clientId: string): Promise<ClientSummary | null> => {
  if (!clientId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: clientId },
    select: { id: true, role: true },
  });

  if (!user) {
    return null;
  }

  if (user.role !== UserRole.user) {
    // Para garantir que somente clientes finais sejam resumidos
    // em caso de consultores ou administradores, retornamos valores zerados.
    return {
      currentBalance: 0,
      investmentsTotal: 0,
      monthlyReturnPercentage: 0,
      totalAssets: 0,
    };
  }

  const [portfolioSnapshot, cashBalances] = await Promise.all([
    calculatePortfolioSnapshot(clientId),
    calculateCashBalances(clientId),
  ]);

  const currentBalance = portfolioSnapshot.currentValue + cashBalances.total.net;
  const monthlyReturnPercentageRaw = portfolioSnapshot.totalInvested > 0
    ? (cashBalances.monthly.net / portfolioSnapshot.totalInvested) * 100
    : 0;

  return {
    currentBalance: roundTwoDecimals(currentBalance),
    investmentsTotal: roundTwoDecimals(portfolioSnapshot.currentValue),
    monthlyReturnPercentage: roundTwoDecimals(monthlyReturnPercentageRaw),
    totalAssets: portfolioSnapshot.totalAssets,
  };
};

export const getConsultantOverview = async (consultantId: string): Promise<ConsultantOverview | null> => {
  const consultant = await normalizeConsultantId(consultantId);
  if (!consultant) {
    return null;
  }

  if (consultant.user.role !== UserRole.consultant) {
    return {
      totalClients: 0,
      totalActiveClients: 0,
      totalManagedAssets: 0,
      averageClientReturn: 0,
    };
  }

  const clients = consultant.clients;

  if (clients.length === 0) {
    return {
      totalClients: 0,
      totalActiveClients: 0,
      totalManagedAssets: 0,
      averageClientReturn: 0,
    };
  }

  const summaries = await Promise.all(
    clients.map(async (assignment) => {
      const summary = await getClientSummary(assignment.clientId);
      return {
        summary,
        status: assignment.status,
      };
    }),
  );

  const validSummaries = summaries.filter(
    (entry): entry is { summary: ClientSummary; status: ConsultantClientStatus } => Boolean(entry.summary),
  );

  if (validSummaries.length === 0) {
    return {
      totalClients: clients.length,
      totalActiveClients: clients.filter(({ status }) => status === ConsultantClientStatus.active).length,
      totalManagedAssets: 0,
      averageClientReturn: 0,
    };
  }

  const totalManagedAssets = validSummaries.reduce(
    (total, { summary }) => total + summary.currentBalance,
    0,
  );

  const averageClientReturnRaw = validSummaries.reduce(
    (total, { summary }) => total + summary.monthlyReturnPercentage,
    0,
  ) / validSummaries.length;

  return {
    totalClients: clients.length,
    totalActiveClients: clients.filter(({ status }) => status === ConsultantClientStatus.active).length,
    totalManagedAssets: roundTwoDecimals(totalManagedAssets),
    averageClientReturn: roundTwoDecimals(averageClientReturnRaw),
  };
};

