import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import { ConsultantClientStatus, UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  getClientSummary,
  getClientsByConsultant,
  getConsultantOverview,
} from '@/services/consultantService';
import { fetchQuotes } from '@/services/brapiQuote';

type ApiError = {
  status: number;
  message: string;
};

type AuthenticatedConsultant = {
  consultantId: string;
  userId: string;
};

const CACHE_CONTROL_HEADER = 's-maxage=300, stale-while-revalidate=60';

const setCachingHeaders = (res: NextApiResponse) => {
  res.setHeader('Cache-Control', CACHE_CONTROL_HEADER);
};

const extractParams = (req: NextApiRequest): string[] => {
  const raw = req.query.params;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return [raw];
};

const extractAction = (req: NextApiRequest): { action: string; segments: string[] } => {
  const segments = extractParams(req);
  return {
    action: segments[0] ?? '',
    segments,
  };
};

export const authenticateConsultant = async (
  req: NextApiRequest,
): Promise<AuthenticatedConsultant> => {
  const token = req.cookies?.token;
  if (!token) {
    throw <ApiError>{ status: 401, message: 'Não autenticado' };
  }

  let payload: { id: string; email: string; role: UserRole };
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET as string) as typeof payload;
  } catch {
    throw <ApiError>{ status: 401, message: 'Token inválido' };
  }

  if (payload.role !== UserRole.consultant) {
    throw <ApiError>{ status: 403, message: 'Acesso restrito a consultores' };
  }

  const consultant = await prisma.consultant.findFirst({
    where: {
      OR: [
        { id: payload.id },
        { userId: payload.id },
      ],
    },
  });

  if (!consultant) {
    throw <ApiError>{ status: 403, message: 'Perfil de consultor não encontrado' };
  }

  return {
    consultantId: consultant.id,
    userId: consultant.userId,
  };
};

export const assertClientOwnership = async (
  consultantId: string,
  clientId: string,
) => {
  if (!clientId) {
    throw <ApiError>{ status: 400, message: 'Cliente não informado' };
  }

  const assignment = await prisma.clientConsultant.findFirst({
    where: {
      consultantId,
      clientId,
      status: ConsultantClientStatus.active,
    },
  });

  if (!assignment) {
    throw <ApiError>{ status: 404, message: 'Cliente não vinculado ao consultor' };
  }

  return assignment;
};

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

  const quotes = await fetchQuotes(symbols);

  let currentValue = 0;
  let totalInvested = 0;

  const assets = portfolio.map((item) => {
    const inferredType =
      item.asset?.type ??
      (item.stock ? 'stock' : 'other');
    const invested = item.totalInvested ?? item.avgPrice * item.quantity;
    totalInvested += invested;

    const symbol = item.asset?.symbol ?? item.stock?.ticker;
    const currentPrice = symbol ? quotes.get(symbol) ?? item.avgPrice : item.avgPrice;
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
      profitPercentage: invested > 0
        ? ((assetCurrentValue - invested) / invested) * 100
        : 0,
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
    const monthDate = new Date(
      movement.data.getFullYear(),
      movement.data.getMonth(),
      1,
    );
    const key = monthDate.toISOString();
    const normalizedType = movement.tipo?.toLowerCase?.() ?? '';
    const isExpense =
      normalizedType.includes('desp') || normalizedType.includes('saida');
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

  const ordered = Array.from(monthMap.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

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

const handleClients = async (
  req: NextApiRequest,
  res: NextApiResponse,
  consultant: AuthenticatedConsultant,
) => {
  const clients = await getClientsByConsultant(consultant.consultantId);
  setCachingHeaders(res);
  res.status(200).json({ clients });
};

const handleOverview = async (
  req: NextApiRequest,
  res: NextApiResponse,
  consultant: AuthenticatedConsultant,
) => {
  const overview = await getConsultantOverview(consultant.consultantId);
  setCachingHeaders(res);
  res.status(200).json({ overview });
};

const handleClientDetail = async (
  clientId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  consultant: AuthenticatedConsultant,
) => {
  if (!clientId) {
    res.status(400).json({ error: 'Cliente não informado' });
    return;
  }

  await assertClientOwnership(consultant.consultantId, clientId);

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

  setCachingHeaders(res);
  res.status(200).json({
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
  });
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }

  let consultant: AuthenticatedConsultant;
  try {
    consultant = await authenticateConsultant(req);
  } catch (error) {
    const apiError = error as ApiError;
    res.status(apiError.status ?? 401).json({ error: apiError.message ?? 'Não autorizado' });
    return;
  }

  const { action, segments } = extractAction(req);

  try {
    if (action === 'clients') {
      await handleClients(req, res, consultant);
      return;
    }

    if (action === 'overview') {
      await handleOverview(req, res, consultant);
      return;
    }

    if (action === 'client') {
      const clientId = segments[1] ?? (Array.isArray(req.query.id) ? req.query.id[0] : req.query.id);
      await handleClientDetail(clientId ?? '', req, res, consultant);
      return;
    }

    res.status(404).json({ error: 'Endpoint não encontrado' });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
      const apiError = error as ApiError;
      res.status(apiError.status).json({ error: apiError.message });
      return;
    }
    console.error('[Consultant API] Error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

