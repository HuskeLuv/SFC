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

  let quotes = new Map<string, number>();
  try {
    quotes = await fetchQuotes(symbols);
  } catch (error) {
    console.warn('[calculatePortfolioSnapshot] Erro ao buscar cotações, usando preços médios como fallback:', error);
    // Em caso de erro, quotes ficará vazio e usaremos avgPrice como fallback
  }

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

    const currentPrice = quotes.get(symbol) ?? item.avgPrice;
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

// ===== NOVAS FUNÇÕES DE AGREGAÇÃO PARA DASHBOARD =====

export interface ClientSavingRate {
  clientId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  averageSavingRate: number; // percentual médio de poupança
}

export interface ClientReturn {
  clientId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  totalReturn: number; // rentabilidade total percentual
  currentBalance: number;
}

export interface ClientPatrimony {
  clientId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  patrimony: number;
}

export interface RiskAlert {
  clientId: string;
  name: string;
  email: string;
  alertType: 'negative_flow' | 'high_concentration' | 'no_aportes';
  message: string;
}

export interface AportesResgates {
  clientId: string;
  name: string;
  email: string;
  totalAportes: number;
  totalResgates: number;
  tendencia: 'positive' | 'negative';
}

export interface AssetDistribution {
  class: string;
  value: number;
  percentage: number;
}

export interface PatrimonyEvolution {
  month: string;
  totalPatrimony: number;
}

const getClientMonthlySavingRates = async (clientId: string, months = 12): Promise<number[]> => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const cashflows = await prisma.cashflow.findMany({
    where: {
      userId: clientId,
      data: { gte: start },
    },
    select: {
      data: true,
      valor: true,
      tipo: true,
    },
  });

  const monthMap = new Map<string, { income: number; expenses: number }>();

  cashflows.forEach((flow) => {
    const monthKey = `${flow.data.getFullYear()}-${flow.data.getMonth()}`;
    const entry = monthMap.get(monthKey) || { income: 0, expenses: 0 };
    
    if (flow.tipo.toLowerCase().includes('receita')) {
      entry.income += flow.valor;
    } else if (flow.tipo.toLowerCase().includes('despesa')) {
      entry.expenses += flow.valor;
    }
    
    monthMap.set(monthKey, entry);
  });

  const rates: number[] = [];
  for (let i = 0; i < months; i++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
    const entry = monthMap.get(monthKey) || { income: 0, expenses: 0 };
    
    const savingRate = entry.income > 0 
      ? ((entry.income - entry.expenses) / entry.income) * 100 
      : 0;
    rates.push(savingRate);
  }

  return rates;
};

const getClientTotalReturn = async (clientId: string): Promise<number> => {
  const summary = await getClientSummary(clientId);
  if (!summary || summary.investmentsTotal === 0) {
    return 0;
  }
  
  // Rentabilidade total = (patrimônio atual - investimentos totais) / investimentos totais * 100
  const portfolioSnapshot = await calculatePortfolioSnapshot(clientId);
  const totalInvested = portfolioSnapshot.totalInvested;
  
  if (totalInvested === 0) {
    return 0;
  }
  
  const totalReturn = ((portfolioSnapshot.currentValue - totalInvested) / totalInvested) * 100;
  return roundTwoDecimals(totalReturn);
};

const getClientDividends = async (clientId: string, year?: number): Promise<number> => {
  const targetYear = year || new Date().getFullYear();
  const yearStart = new Date(targetYear, 0, 1);
  const yearEnd = new Date(targetYear, 11, 31, 23, 59, 59);

  const dividendCashflows = await prisma.cashflow.findMany({
    where: {
      userId: clientId,
      tipo: 'Receita',
      data: {
        gte: yearStart,
        lte: yearEnd,
      },
      OR: [
        { categoria: { contains: 'dividendo', mode: 'insensitive' } },
        { categoria: { contains: 'provento', mode: 'insensitive' } },
        { categoria: { contains: 'jcp', mode: 'insensitive' } },
        { descricao: { contains: 'dividendo', mode: 'insensitive' } },
        { descricao: { contains: 'provento', mode: 'insensitive' } },
        { descricao: { contains: 'jcp', mode: 'insensitive' } },
      ],
    },
    select: {
      valor: true,
    },
  });

  return dividendCashflows.reduce((sum, flow) => sum + flow.valor, 0);
};

const getClientAportesResgates = async (clientId: string, year?: number): Promise<{ aportes: number; resgates: number }> => {
  const targetYear = year || new Date().getFullYear();
  const yearStart = new Date(targetYear, 0, 1);
  const yearEnd = new Date(targetYear, 11, 31, 23, 59, 59);

  const transactions = await prisma.stockTransaction.findMany({
    where: {
      userId: clientId,
      date: {
        gte: yearStart,
        lte: yearEnd,
      },
    },
    select: {
      type: true,
      total: true,
      fees: true,
    },
  });

  let aportes = 0;
  let resgates = 0;

  transactions.forEach((tx) => {
    const total = tx.total + (tx.fees || 0);
    if (tx.type.toLowerCase() === 'compra') {
      aportes += total;
    } else if (tx.type.toLowerCase() === 'venda') {
      resgates += total;
    }
  });

  return { aportes, resgates };
};

const getClientPortfolioConcentration = async (clientId: string): Promise<number> => {
  const portfolio = await prisma.portfolio.findMany({
    where: { userId: clientId },
    include: {
      asset: true,
      stock: true,
    },
  });

  if (portfolio.length === 0) {
    return 0;
  }

  const symbols = portfolio
    .map((item) => item.asset?.symbol ?? item.stock?.ticker ?? null)
    .filter((symbol): symbol is string => Boolean(symbol));

  let quotes = new Map<string, number>();
  try {
    quotes = await fetchQuotes(symbols);
  } catch (error) {
    console.warn('[getClientPortfolioConcentration] Erro ao buscar cotações, usando preços médios como fallback:', error);
    // Em caso de erro, quotes ficará vazio e usaremos avgPrice como fallback
  }

  const assetValues: number[] = [];
  portfolio.forEach((item) => {
    const symbol = item.asset?.symbol ?? item.stock?.ticker;
    const currentPrice = symbol ? quotes.get(symbol) ?? item.avgPrice : item.avgPrice;
    assetValues.push(currentPrice * item.quantity);
  });

  const totalValue = assetValues.reduce((sum, val) => sum + val, 0);
  if (totalValue === 0) {
    return 0;
  }

  const maxValue = Math.max(...assetValues);
  return roundTwoDecimals((maxValue / totalValue) * 100);
};

const getClientNegativeFlowMonths = async (clientId: string, months = 3): Promise<number> => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const cashflows = await prisma.cashflow.findMany({
    where: {
      userId: clientId,
      data: { gte: start },
    },
    select: {
      data: true,
      valor: true,
      tipo: true,
    },
  });

  const monthMap = new Map<string, number>();

  cashflows.forEach((flow) => {
    const monthKey = `${flow.data.getFullYear()}-${flow.data.getMonth()}`;
    const current = monthMap.get(monthKey) || 0;
    
    if (flow.tipo.toLowerCase().includes('receita')) {
      monthMap.set(monthKey, current + flow.valor);
    } else if (flow.tipo.toLowerCase().includes('despesa')) {
      monthMap.set(monthKey, current - flow.valor);
    }
  });

  let negativeCount = 0;
  monthMap.forEach((net) => {
    if (net < 0) {
      negativeCount++;
    }
  });

  return negativeCount;
};

const getClientLastAporteDate = async (clientId: string): Promise<Date | null> => {
  const lastAporte = await prisma.stockTransaction.findFirst({
    where: {
      userId: clientId,
      type: 'compra',
    },
    orderBy: {
      date: 'desc',
    },
    select: {
      date: true,
    },
  });

  return lastAporte?.date || null;
};

export const getAverageSavingRate = async (consultantId: string): Promise<number> => {
  const consultant = await normalizeConsultantId(consultantId);
  if (!consultant) {
    return 0;
  }

  const clients = consultant.clients.filter((c) => c.status === ConsultantClientStatus.active);
  if (clients.length === 0) {
    return 0;
  }

  const allRates: number[] = [];
  for (const assignment of clients) {
    const rates = await getClientMonthlySavingRates(assignment.clientId);
    allRates.push(...rates);
  }

  if (allRates.length === 0) {
    return 0;
  }

  const average = allRates.reduce((sum, rate) => sum + rate, 0) / allRates.length;
  return roundTwoDecimals(average);
};

export const getTopClientsByReturn = async (consultantId: string, limit = 5): Promise<ClientReturn[]> => {
  const consultant = await normalizeConsultantId(consultantId);
  if (!consultant) {
    return [];
  }

  const clients = consultant.clients.filter((c) => c.status === ConsultantClientStatus.active);
  if (clients.length === 0) {
    return [];
  }

  const clientReturns: ClientReturn[] = await Promise.all(
    clients.map(async (assignment) => {
      const [totalReturn, summary] = await Promise.all([
        getClientTotalReturn(assignment.clientId),
        getClientSummary(assignment.clientId),
      ]);

      return {
        clientId: assignment.clientId,
        name: assignment.client?.name ?? 'Cliente sem nome',
        email: assignment.client?.email ?? '',
        avatarUrl: assignment.client?.avatarUrl,
        totalReturn,
        currentBalance: summary?.currentBalance ?? 0,
      };
    }),
  );

  return clientReturns
    .sort((a, b) => b.totalReturn - a.totalReturn)
    .slice(0, limit);
};

export const getTopClientsByPatrimony = async (consultantId: string, limit = 5): Promise<ClientPatrimony[]> => {
  const consultant = await normalizeConsultantId(consultantId);
  if (!consultant) {
    return [];
  }

  const clients = consultant.clients.filter((c) => c.status === ConsultantClientStatus.active);
  if (clients.length === 0) {
    return [];
  }

  const clientPatrimonies: ClientPatrimony[] = await Promise.all(
    clients.map(async (assignment) => {
      const summary = await getClientSummary(assignment.clientId);

      return {
        clientId: assignment.clientId,
        name: assignment.client?.name ?? 'Cliente sem nome',
        email: assignment.client?.email ?? '',
        avatarUrl: assignment.client?.avatarUrl,
        patrimony: summary?.currentBalance ?? 0,
      };
    }),
  );

  return clientPatrimonies
    .sort((a, b) => b.patrimony - a.patrimony)
    .slice(0, limit);
};

export const getClientWithHighestPatrimony = async (consultantId: string): Promise<ClientPatrimony | null> => {
  const top = await getTopClientsByPatrimony(consultantId, 1);
  return top[0] || null;
};

export const getTotalDividends = async (consultantId: string, year?: number): Promise<number> => {
  const consultant = await normalizeConsultantId(consultantId);
  if (!consultant) {
    return 0;
  }

  const clients = consultant.clients.filter((c) => c.status === ConsultantClientStatus.active);
  if (clients.length === 0) {
    return 0;
  }

  const dividends = await Promise.all(
    clients.map((assignment) => getClientDividends(assignment.clientId, year)),
  );

  const total = dividends.reduce((sum, div) => sum + div, 0);
  return roundTwoDecimals(total);
};

export const getTopClientsBySavingRate = async (consultantId: string, limit = 5): Promise<ClientSavingRate[]> => {
  const consultant = await normalizeConsultantId(consultantId);
  if (!consultant) {
    return [];
  }

  const clients = consultant.clients.filter((c) => c.status === ConsultantClientStatus.active);
  if (clients.length === 0) {
    return [];
  }

  const clientSavingRates: ClientSavingRate[] = await Promise.all(
    clients.map(async (assignment) => {
      const rates = await getClientMonthlySavingRates(assignment.clientId);
      const average = rates.length > 0
        ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length
        : 0;

      return {
        clientId: assignment.clientId,
        name: assignment.client?.name ?? 'Cliente sem nome',
        email: assignment.client?.email ?? '',
        avatarUrl: assignment.client?.avatarUrl,
        averageSavingRate: roundTwoDecimals(average),
      };
    }),
  );

  return clientSavingRates
    .sort((a, b) => b.averageSavingRate - a.averageSavingRate)
    .slice(0, limit);
};

export const getClientsWithNegativeFlow = async (consultantId: string): Promise<RiskAlert[]> => {
  const consultant = await normalizeConsultantId(consultantId);
  if (!consultant) {
    return [];
  }

  const clients = consultant.clients.filter((c) => c.status === ConsultantClientStatus.active);
  if (clients.length === 0) {
    return [];
  }

  const alerts: RiskAlert[] = [];

  for (const assignment of clients) {
    const negativeMonths = await getClientNegativeFlowMonths(assignment.clientId, 3);
    if (negativeMonths >= 3) {
      alerts.push({
        clientId: assignment.clientId,
        name: assignment.client?.name ?? 'Cliente sem nome',
        email: assignment.client?.email ?? '',
        alertType: 'negative_flow',
        message: `Fluxo negativo recorrente nos últimos 3 meses`,
      });
    }
  }

  return alerts;
};

export const getClientsWithoutAportes = async (consultantId: string, daysThreshold = 90): Promise<RiskAlert[]> => {
  const consultant = await normalizeConsultantId(consultantId);
  if (!consultant) {
    return [];
  }

  const clients = consultant.clients.filter((c) => c.status === ConsultantClientStatus.active);
  if (clients.length === 0) {
    return [];
  }

  const alerts: RiskAlert[] = [];
  const now = new Date();
  const thresholdDate = new Date(now.getTime() - daysThreshold * 24 * 60 * 60 * 1000);

  for (const assignment of clients) {
    const lastAporte = await getClientLastAporteDate(assignment.clientId);
    if (!lastAporte || lastAporte < thresholdDate) {
      alerts.push({
        clientId: assignment.clientId,
        name: assignment.client?.name ?? 'Cliente sem nome',
        email: assignment.client?.email ?? '',
        alertType: 'no_aportes',
        message: `Sem aportes há mais de ${daysThreshold} dias`,
      });
    }
  }

  return alerts;
};

export const getClientsHighConcentration = async (consultantId: string, threshold = 60): Promise<RiskAlert[]> => {
  const consultant = await normalizeConsultantId(consultantId);
  if (!consultant) {
    return [];
  }

  const clients = consultant.clients.filter((c) => c.status === ConsultantClientStatus.active);
  if (clients.length === 0) {
    return [];
  }

  const alerts: RiskAlert[] = [];

  for (const assignment of clients) {
    const concentration = await getClientPortfolioConcentration(assignment.clientId);
    if (concentration > threshold) {
      alerts.push({
        clientId: assignment.clientId,
        name: assignment.client?.name ?? 'Cliente sem nome',
        email: assignment.client?.email ?? '',
        alertType: 'high_concentration',
        message: `Alta concentração em um único ativo (${concentration.toFixed(1)}%)`,
      });
    }
  }

  return alerts;
};

export const getAportesResgatesByClient = async (consultantId: string, year?: number): Promise<AportesResgates[]> => {
  const consultant = await normalizeConsultantId(consultantId);
  if (!consultant) {
    return [];
  }

  const clients = consultant.clients.filter((c) => c.status === ConsultantClientStatus.active);
  if (clients.length === 0) {
    return [];
  }

  const results: AportesResgates[] = await Promise.all(
    clients.map(async (assignment) => {
      const { aportes, resgates } = await getClientAportesResgates(assignment.clientId, year);

      return {
        clientId: assignment.clientId,
        name: assignment.client?.name ?? 'Cliente sem nome',
        email: assignment.client?.email ?? '',
        totalAportes: roundTwoDecimals(aportes),
        totalResgates: roundTwoDecimals(resgates),
        tendencia: aportes > resgates ? 'positive' : 'negative',
      };
    }),
  );

  return results;
};

export const getConsolidatedAssetDistribution = async (consultantId: string): Promise<AssetDistribution[]> => {
  const consultant = await normalizeConsultantId(consultantId);
  if (!consultant) {
    return [];
  }

  const clients = consultant.clients.filter((c) => c.status === ConsultantClientStatus.active);
  if (clients.length === 0) {
    return [];
  }

  const classMap = new Map<string, number>();

  for (const assignment of clients) {
    const portfolio = await prisma.portfolio.findMany({
      where: { userId: assignment.clientId },
      include: {
        asset: true,
        stock: true,
      },
    });

    const symbols = portfolio
      .map((item) => item.asset?.symbol ?? item.stock?.ticker ?? null)
      .filter((symbol): symbol is string => Boolean(symbol));

    let quotes = new Map<string, number>();
    try {
      quotes = await fetchQuotes(symbols);
    } catch (error) {
      console.warn('[getConsolidatedAssetDistribution] Erro ao buscar cotações, usando preços médios como fallback:', error);
      // Em caso de erro, quotes ficará vazio e usaremos avgPrice como fallback
    }

    portfolio.forEach((item) => {
      const assetType = (item.asset?.type || (item.stock ? 'stock' : 'other'))?.toLowerCase() || '';
      const symbol = item.asset?.symbol ?? item.stock?.ticker;
      const currentPrice = symbol ? quotes.get(symbol) ?? item.avgPrice : item.avgPrice;
      const value = currentPrice * item.quantity;

      let classKey = 'Outros';
      
      // Mapear tipos de ativos para os mesmos tipos usados no gráfico de carteira consolidada
      switch (assetType) {
        case 'ação':
        case 'acao':
        case 'stock': {
          // Verificar se é ação brasileira ou stock internacional
          if (item.asset?.currency === 'BRL' || !item.asset?.currency) {
            classKey = 'Ações';
          } else {
            classKey = 'Stocks';
          }
          break;
        }
        case 'bdr':
        case 'brd':
          classKey = 'Stocks';
          break;
        case 'fii':
          classKey = "FII's";
          break;
        case 'fund':
        case 'funds': {
          // Verificar se é FII ou FIM/FIA baseado no símbolo ou nome
          const symbolUpper = symbol?.toUpperCase() || '';
          const nameLower = (item.asset?.name || '').toLowerCase();
          if (symbolUpper.endsWith('11') || nameLower.includes('fii') || nameLower.includes('imobili')) {
            classKey = "FII's";
          } else {
            classKey = 'FIM/FIA';
          }
          break;
        }
        case 'etf':
          classKey = "ETF's";
          break;
        case 'reit':
          classKey = "REIT's";
          break;
        case 'crypto':
        case 'currency':
          classKey = 'Moedas, Criptomoedas & outros';
          break;
        case 'bond':
          classKey = 'Renda Fixa & Fundos de Renda Fixa';
          break;
        case 'insurance':
          classKey = 'Previdência & Seguros';
          break;
        case 'opportunity':
          classKey = 'Reserva de Oportunidade';
          break;
        case 'emergency':
          classKey = 'Reserva de Emergência';
          break;
        case 'option':
        case 'opcoes':
        case 'options':
          classKey = 'Opções';
          break;
        default:
          classKey = 'Outros';
      }

      const current = classMap.get(classKey) || 0;
      classMap.set(classKey, current + value);
    });

    // Adicionar caixa (saldo líquido) - pode ser mapeado para Reserva de Oportunidade se positivo
    const cashBalances = await calculateCashBalances(assignment.clientId);
    const cash = cashBalances.total.net;
    if (cash > 0) {
      // Adicionar ao "Reserva de Oportunidade" ou criar categoria "Caixa"
      const currentReserva = classMap.get('Reserva de Oportunidade') || 0;
      classMap.set('Reserva de Oportunidade', currentReserva + cash);
    }
  }

  const total = Array.from(classMap.values()).reduce((sum, val) => sum + val, 0);
  if (total === 0) {
    return [];
  }

  // Ordem padrão dos tipos de ativos (mesma ordem do gráfico de carteira consolidada)
  const assetTypeOrder = [
    "Reserva de Emergência",
    "Reserva de Oportunidade",
    "Renda Fixa & Fundos de Renda Fixa",
    "FIM/FIA",
    "FII's",
    "Ações",
    "Stocks",
    "REIT's",
    "ETF's",
    "Moedas, Criptomoedas & outros",
    "Previdência & Seguros",
    "Opções",
    "Outros",
  ];

  const distribution: AssetDistribution[] = Array.from(classMap.entries())
    .map(([classKey, value]) => ({
      class: classKey,
      value: roundTwoDecimals(value),
      percentage: roundTwoDecimals((value / total) * 100),
    }))
    .sort((a, b) => {
      // Ordenar pela ordem padrão primeiro, depois por valor
      const indexA = assetTypeOrder.indexOf(a.class);
      const indexB = assetTypeOrder.indexOf(b.class);
      if (indexA === -1 && indexB === -1) return b.value - a.value;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

  return distribution;
};

export const getPatrimonyEvolution = async (consultantId: string, months = 12): Promise<PatrimonyEvolution[]> => {
  const consultant = await normalizeConsultantId(consultantId);
  if (!consultant) {
    return [];
  }

  const clients = consultant.clients.filter((c) => c.status === ConsultantClientStatus.active);
  if (clients.length === 0) {
    return [];
  }

  const now = new Date();
  const evolution: PatrimonyEvolution[] = [];

  // Para simplificar, vamos calcular o patrimônio atual e projetar para os meses anteriores
  // Em uma implementação mais completa, seria necessário rastrear o patrimônio histórico
  const summaries = await Promise.all(
    clients.map((assignment) => getClientSummary(assignment.clientId)),
  );
  
  const currentTotalPatrimony = summaries.reduce((sum, s) => sum + (s?.currentBalance || 0), 0);

  // Criar série mensal (por enquanto usando o patrimônio atual como base)
  // Em produção, seria necessário calcular o patrimônio histórico real
  for (let i = 0; i < months; i++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    evolution.push({
      month: monthDate.toISOString(),
      totalPatrimony: roundTwoDecimals(currentTotalPatrimony),
    });
  }

  return evolution;
};

