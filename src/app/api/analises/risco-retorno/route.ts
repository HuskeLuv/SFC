import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuthWithActing } from '@/utils/auth';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import {
  buildPatrimonioHistorico,
  filterInvestmentsExclReservas,
} from '@/services/portfolio/patrimonioHistoricoBuilder';
import { createFixedIncomePricer } from '@/services/portfolio/fixedIncomePricing';
import type { FixedIncomeAssetWithAsset } from '@/services/portfolio/patrimonioHistoricoBuilder';
import { getAssetHistory, isNonMarketSymbol } from '@/services/pricing/assetPriceService';
import { computeBeta } from '@/services/analises/sensibilidadeCarteira';

/** Janela para cálculo de beta: 24 meses, mesma usada em sensibilidade-carteira. */
const BETA_WINDOW_MONTHS = 24;
const IBOV_SYMBOL = '^BVSP';
/** TTL do cache — carteira estável serve do cache por até 24h. */
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Hash estável da composição: invalida o cache quando posição/preço médio muda. */
function computePortfolioHash(
  items: Array<{ symbol: string; quantity: number; avgPrice: number }>,
): string {
  const normalized = items
    .filter((i) => i.symbol)
    .map((i) => `${i.symbol}:${i.quantity}:${i.avgPrice}`)
    .sort()
    .join('|');
  return createHash('sha256').update(normalized).digest('hex');
}

interface RiscoRetornoMetrics {
  retornoAnual: number;
  retornoCDI: number;
  volatilidade: number;
  sharpe: number;
}

interface SensibilidadeItem {
  ticker: string;
  nome: string;
  beta: number;
}

interface RiscoRetornoResponse {
  carteira: RiscoRetornoMetrics;
  anual: Record<number, RiscoRetornoMetrics>;
  sensibilidade: SensibilidadeItem[];
  anosDisponiveis: number[];
}

/**
 * Extrai retornos mensais a partir do TWR (time-weighted return) acumulado.
 * O TWR já desconta efeito de aportes/resgates, então o retorno mensal é puro.
 */
function calcularRetornosMensaisTWR(
  historicoTWR: Array<{ data: number; value: number }>,
): Array<{ year: number; month: number; retorno: number }> {
  // Agrupa por mês (pega último valor TWR acumulado de cada mês)
  const porMes = new Map<string, { data: number; twrAcumulado: number }>();
  for (const item of historicoTWR) {
    const d = new Date(item.data);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    porMes.set(key, { data: item.data, twrAcumulado: item.value });
  }

  const meses = Array.from(porMes.entries()).sort(([a], [b]) => a.localeCompare(b));
  const retornos: Array<{ year: number; month: number; retorno: number }> = [];

  for (let i = 1; i < meses.length; i++) {
    const twrAnterior = 1 + meses[i - 1][1].twrAcumulado / 100;
    const twrAtual = 1 + meses[i][1].twrAcumulado / 100;
    if (twrAnterior > 0) {
      const [yearStr, monthStr] = meses[i][0].split('-');
      retornos.push({
        year: Number(yearStr),
        month: Number(monthStr),
        retorno: twrAtual / twrAnterior - 1,
      });
    }
  }

  return retornos;
}

/**
 * Calcula volatilidade anualizada (desvio padrão dos retornos mensais × √12).
 */
function calcularVolatilidade(retornosMensais: number[]): number {
  if (retornosMensais.length < 2) return 0;
  const media = retornosMensais.reduce((a, b) => a + b, 0) / retornosMensais.length;
  const variancia =
    retornosMensais.reduce((sum, r) => sum + (r - media) ** 2, 0) / (retornosMensais.length - 1);
  return Math.sqrt(variancia) * Math.sqrt(12);
}

/**
 * Calcula retorno acumulado no período (sem anualizar).
 * Para períodos < 12 meses, mostra o retorno real do período.
 * Para períodos >= 12 meses, anualiza com composição geométrica.
 */
function calcularRetorno(retornosMensais: number[]): number {
  if (retornosMensais.length === 0) return 0;
  const produto = retornosMensais.reduce((acc, r) => acc * (1 + r), 1);
  const meses = retornosMensais.length;
  if (meses >= 12) {
    return (produto ** (12 / meses) - 1) * 100;
  }
  return (produto - 1) * 100;
}

/**
 * Calcula métricas de risco x retorno.
 */
function calcularMetricas(retornosMensais: number[], cdiPeriodo: number): RiscoRetornoMetrics {
  const retornoAnual = calcularRetorno(retornosMensais);
  const volatilidade = calcularVolatilidade(retornosMensais) * 100;
  const sharpe = volatilidade > 0 ? (retornoAnual - cdiPeriodo) / volatilidade : 0;

  return {
    retornoAnual: Math.round(retornoAnual * 100) / 100,
    retornoCDI: Math.round(cdiPeriodo * 100) / 100,
    volatilidade: Math.round(volatilidade * 100) / 100,
    sharpe: Math.round(sharpe * 100) / 100,
  };
}

/**
 * Calcula CDI acumulado para um período específico a partir das taxas diárias.
 */
function calcularCdiPeriodo(
  cdiRecords: Array<{ date: Date; value: unknown }>,
  startDate: Date,
  endDate: Date,
): number {
  const filtered = cdiRecords.filter((r) => r.date >= startDate && r.date <= endDate);
  if (filtered.length === 0) return 0;
  const acumulado = filtered.reduce((acc, r) => acc * (1 + Number(r.value)), 1);
  return (acumulado - 1) * 100;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  // Busca portfolio, transações, investimentos e renda fixa em paralelo
  const [portfolio, stockTransactions, investmentGroups, fixedIncomeAssets] = await Promise.all([
    prisma.portfolio.findMany({
      where: { userId: targetUserId },
      include: { asset: true, stock: true },
    }),
    prisma.stockTransaction.findMany({
      where: { userId: targetUserId },
      include: { stock: true, asset: true },
      orderBy: { date: 'asc' },
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

  // Cache hit: hash da composição igual + idade < TTL → serve payload cru.
  const portfolioHash = computePortfolioHash(
    portfolio.map((p) => ({
      symbol: (p.asset?.symbol || p.stock?.ticker || '').toUpperCase(),
      quantity: p.quantity,
      avgPrice: p.avgPrice,
    })),
  );
  // Cache é opcional — em ambientes onde a tabela ainda não foi migrada (P2021),
  // seguimos sem cache em vez de quebrar a rota.
  let cached: Awaited<ReturnType<typeof prisma.portfolioRiscoRetornoCache.findUnique>> = null;
  try {
    cached = await prisma.portfolioRiscoRetornoCache.findUnique({
      where: { userId: targetUserId },
    });
  } catch (error) {
    const prismaError = error as Prisma.PrismaClientKnownRequestError;
    if (prismaError?.code !== 'P2021') throw error;
  }
  if (cached && cached.portfolioHash === portfolioHash) {
    const age = Date.now() - cached.computedAt.getTime();
    if (age <= CACHE_MAX_AGE_MS) {
      return NextResponse.json(cached.payload as unknown as RiscoRetornoResponse);
    }
  }

  const allInvestments = investmentGroups.flatMap((g) => g.items || []);
  const cashflowInvestments = filterInvestmentsExclReservas(allInvestments);

  // Calcula saldo bruto e valor aplicado atuais
  let saldoBruto = 0;
  let valorAplicado = 0;
  for (const item of portfolio) {
    saldoBruto += item.quantity * item.avgPrice;
    valorAplicado += item.totalInvested > 0 ? item.totalInvested : item.quantity * item.avgPrice;
  }

  // Pricer compartilhado: marcação na curva (CDI/IPCA/Tesouro PU) para FI no histórico.
  // Reusa fixedIncomeAssets já carregado pra evitar query duplicada.
  const fiPricer = await createFixedIncomePricer(targetUserId, {
    preloadedAssets: fixedIncomeAssets as unknown as FixedIncomeAssetWithAsset[],
  });

  // Constrói histórico de patrimônio com TWR (até 36 meses)
  const built = await buildPatrimonioHistorico({
    portfolio,
    fixedIncomeAssets,
    stockTransactions,
    investmentsExclReservas: cashflowInvestments,
    saldoBrutoAtual: saldoBruto,
    valorAplicadoAtual: valorAplicado,
    maxHistoricoMonths: 36,
    patchLastDayWithLiveTotals: true,
    fixedIncomeValueSeriesBuilder: fiPricer.buildValueSeriesForAsset,
  });

  // Busca CDI dos últimos 3 anos (para cobrir dados anuais)
  const tresAnosAtras = new Date();
  tresAnosAtras.setFullYear(tresAnosAtras.getFullYear() - 3);

  const cdiRecords = await prisma.economicIndex.findMany({
    where: {
      indexType: 'CDI',
      date: { gte: tresAnosAtras },
    },
    orderBy: { date: 'asc' },
  });

  // CDI anualizado (últimos 12 meses)
  const umAnoAtras = new Date();
  umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
  let cdiAnual = 13.15; // fallback SELIC atual
  const cdiUltimoAno = cdiRecords.filter((r) => r.date >= umAnoAtras);
  if (cdiUltimoAno.length > 0) {
    const acumulado = cdiUltimoAno.reduce((acc, r) => acc * (1 + Number(r.value)), 1);
    const diasUteis = cdiUltimoAno.length;
    cdiAnual = (acumulado ** (252 / diasUteis) - 1) * 100;
  }

  // Calcula retornos mensais a partir do TWR (desconsidera aportes/resgates)
  const retornosMensais = calcularRetornosMensaisTWR(built.historicoTWR);

  // Métricas gerais (carteira — todos os meses disponíveis)
  const todosRetornos = retornosMensais.map((r) => r.retorno);
  const carteira = calcularMetricas(todosRetornos, cdiAnual);

  // Métricas por ano
  const anosSet = new Set(retornosMensais.map((r) => r.year));
  const anoAtual = new Date().getFullYear();
  anosSet.add(anoAtual);
  const anosDisponiveis = Array.from(anosSet).sort((a, b) => b - a);

  const anual: Record<number, RiscoRetornoMetrics> = {};
  for (const ano of anosDisponiveis) {
    const retornosDoAno = retornosMensais.filter((r) => r.year === ano).map((r) => r.retorno);

    // CDI real acumulado do ano (jan 1 até dez 31 ou hoje)
    const inicioAno = new Date(ano, 0, 1);
    const fimAno = ano === anoAtual ? new Date() : new Date(ano, 11, 31);
    const cdiDoAno = calcularCdiPeriodo(cdiRecords, inicioAno, fimAno);

    anual[ano] = calcularMetricas(retornosDoAno, cdiDoAno);
  }

  // Sensibilidade ao mercado (beta) — calculado localmente vs. IBOVESPA.
  // BRAPI não fornece beta para ações B3, então derivamos do histórico de preços
  // armazenado em AssetPriceHistory (DB-first, com fallback BRAPI em getAssetHistory).
  const marketSymbols = [
    ...new Set(
      portfolio
        .map((item) => (item.asset?.symbol || item.stock?.ticker || '').toUpperCase())
        .filter((s) => s && !isNonMarketSymbol(s)),
    ),
  ];

  const betaEndDate = new Date();
  const betaStartDate = new Date(betaEndDate);
  betaStartDate.setMonth(betaStartDate.getMonth() - (BETA_WINDOW_MONTHS + 1));

  const ibovHistory = await getAssetHistory(IBOV_SYMBOL, betaStartDate, betaEndDate);

  const betaBySymbol = new Map<string, number>();
  if (ibovHistory.length > 0) {
    const entries = await Promise.all(
      marketSymbols.map(async (symbol) => {
        const assetHistory = await getAssetHistory(symbol, betaStartDate, betaEndDate);
        const beta = computeBeta(assetHistory, ibovHistory);
        return { symbol, beta };
      }),
    );
    for (const { symbol, beta } of entries) {
      if (beta !== null) betaBySymbol.set(symbol, beta);
    }
  }

  const sensibilidade: SensibilidadeItem[] = portfolio
    .map((item) => {
      const ticker = (item.asset?.symbol || item.stock?.ticker || '').toUpperCase();
      if (!ticker) return null;
      const beta = betaBySymbol.get(ticker);
      if (beta === undefined) return null;
      return {
        ticker,
        nome: item.asset?.name || item.stock?.companyName || ticker,
        beta,
      };
    })
    .filter((item): item is SensibilidadeItem => item !== null)
    .sort((a, b) => b.beta - a.beta);

  const response: RiscoRetornoResponse = {
    carteira,
    anual,
    sensibilidade,
    anosDisponiveis,
  };

  try {
    await prisma.portfolioRiscoRetornoCache.upsert({
      where: { userId: targetUserId },
      update: {
        portfolioHash,
        payload: response as unknown as object,
        computedAt: new Date(),
      },
      create: {
        userId: targetUserId,
        portfolioHash,
        payload: response as unknown as object,
      },
    });
  } catch (error) {
    const prismaError = error as Prisma.PrismaClientKnownRequestError;
    if (prismaError?.code !== 'P2021') throw error;
    // Sem cache em ambientes sem a tabela migrada — devolvemos o payload mesmo assim.
  }

  return NextResponse.json(response);
});
