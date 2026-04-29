import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler, Errors } from '@/utils/apiErrorHandler';
import prisma from '@/lib/prisma';
import {
  buildPatrimonioHistorico,
  filterInvestmentsExclReservas,
} from '@/services/portfolio/patrimonioHistoricoBuilder';
import { createFixedIncomePricer } from '@/services/portfolio/fixedIncomePricing';
import type { FixedIncomeAssetWithAsset } from '@/services/portfolio/patrimonioHistoricoBuilder';
import { computePortfolioLiveTotals } from '@/services/portfolio/portfolioLiveTotals';
import { getAssetHistory, isNonMarketSymbol } from '@/services/pricing/assetPriceService';
import { buildSensibilidadeCarteira, monthKey } from '@/services/analises/sensibilidadeCarteira';
import type { SensibilidadeCarteiraResponse } from '@/types/analises';

/** Janela TTL para cache do payload: se o portfolioHash não mudou, serve do cache por até 24h. */
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const windowMonthsSchema = z
  .string()
  .nullish()
  .transform((v) => (v == null ? 24 : Number(v)))
  .pipe(z.number().int().min(12).max(60));

interface MarketPosition {
  symbol: string;
  nome: string;
  quantity: number;
  price: number; // preço atual (ou avgPrice como fallback)
  rawWeight: number; // quantity × price
}

/** Retornos mensais da carteira a partir do TWR acumulado (mesma lógica do risco-retorno). */
function monthlyReturnsFromTWR(
  historicoTWR: Array<{ data: number; value: number }>,
): Map<string, number> {
  const byMonth = new Map<string, number>();
  for (const item of historicoTWR) {
    byMonth.set(monthKey(item.data), item.value);
  }
  const sortedKeys = Array.from(byMonth.keys()).sort();
  const returns = new Map<string, number>();
  for (let i = 1; i < sortedKeys.length; i++) {
    const twrAnt = 1 + byMonth.get(sortedKeys[i - 1])! / 100;
    const twrAtual = 1 + byMonth.get(sortedKeys[i])! / 100;
    if (twrAnt > 0) returns.set(sortedKeys[i], twrAtual / twrAnt - 1);
  }
  return returns;
}

/** Hash estável da composição atual — invalida o cache quando muda peso/ativos. */
function computePortfolioHash(positions: MarketPosition[]): string {
  const normalized = positions
    .map((p) => `${p.symbol}:${p.quantity}:${p.price}`)
    .sort()
    .join('|');
  return createHash('sha256').update(normalized).digest('hex');
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const url = new URL(request.url);
  const parsed = windowMonthsSchema.safeParse(url.searchParams.get('windowMonths'));
  if (!parsed.success)
    throw Errors.badRequest('windowMonths inválido (esperado inteiro entre 12 e 60)');
  const windowMonths = parsed.data;

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

  // Seleciona posições de mercado (exclui reservas/renda-fixa/TD/FX e afins)
  const positions: MarketPosition[] = [];
  for (const p of portfolio) {
    const symbol = (p.asset?.symbol ?? p.stock?.ticker ?? '').toUpperCase();
    if (!symbol || isNonMarketSymbol(symbol)) continue;
    const currentPrice = p.asset?.currentPrice ? Number(p.asset.currentPrice) : p.avgPrice;
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) continue;
    positions.push({
      symbol,
      nome: p.asset?.name ?? p.stock?.companyName ?? symbol,
      quantity: p.quantity,
      price: currentPrice,
      rawWeight: p.quantity * currentPrice,
    });
  }

  // Resposta vazia estável para carteiras sem ativos de mercado
  if (positions.length === 0) {
    const empty: SensibilidadeCarteiraResponse = {
      windowMonths,
      mesesUtilizados: 0,
      calculadoEm: new Date().toISOString(),
      carteira: { volatilidadeAnual: 0 },
      ativos: [],
      excluidos: [],
    };
    return NextResponse.json(empty);
  }

  // Cache hit: hash igual + idade < TTL. Em ambientes sem a tabela migrada (P2021),
  // segue sem cache em vez de quebrar a rota.
  const portfolioHash = computePortfolioHash(positions);
  let cached: Awaited<ReturnType<typeof prisma.portfolioSensibilidadeCache.findUnique>> = null;
  try {
    cached = await prisma.portfolioSensibilidadeCache.findUnique({
      where: { userId_windowMonths: { userId: targetUserId, windowMonths } },
    });
  } catch (error) {
    const prismaError = error as Prisma.PrismaClientKnownRequestError;
    if (prismaError?.code !== 'P2021') throw error;
  }
  if (cached && cached.portfolioHash === portfolioHash) {
    const age = Date.now() - cached.computedAt.getTime();
    if (age <= CACHE_MAX_AGE_MS) {
      return NextResponse.json(cached.payload as unknown as SensibilidadeCarteiraResponse);
    }
  }

  // Séries da carteira via TWR (último N meses com folga de 1 mês para permitir o retorno inicial)
  const allInvestments = investmentGroups.flatMap((g) => g.items || []);
  const cashflowInvestments = filterInvestmentsExclReservas(allInvestments);

  const fiPricer = await createFixedIncomePricer(targetUserId, {
    preloadedAssets: fixedIncomeAssets as unknown as FixedIncomeAssetWithAsset[],
  });

  // Saldo bruto = valor de mercado real (cotações + FI marcado na curva). Usar
  // `quantity * avgPrice` aqui combinado com `patchLastDayWithLiveTotals` cravava o último
  // dia em custo de aquisição, distorcendo o TWR usado nas correlações.
  const { saldoBruto, valorAplicado } = await computePortfolioLiveTotals({
    portfolio,
    fixedIncomeAssets: fixedIncomeAssets as unknown as FixedIncomeAssetWithAsset[],
    investmentsExclReservas: cashflowInvestments,
    fiPricer,
  });
  const built = await buildPatrimonioHistorico({
    portfolio,
    fixedIncomeAssets,
    stockTransactions,
    investmentsExclReservas: cashflowInvestments,
    saldoBrutoAtual: saldoBruto,
    valorAplicadoAtual: valorAplicado,
    maxHistoricoMonths: windowMonths + 1,
    patchLastDayWithLiveTotals: true,
    fixedIncomeValueSeriesBuilder: fiPricer.buildValueSeriesForAsset,
    implicitCdiValueSeriesBuilder: fiPricer.buildImplicitCdiValueSeries,
  });

  const portfolioMonthlyReturns = monthlyReturnsFromTWR(built.historicoTWR);

  // Histórico diário de cada ativo (DB-first, fallback BRAPI em getAssetHistory)
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - (windowMonths + 1));

  const assetsWithHistory = await Promise.all(
    positions.map(async (pos) => ({
      ticker: pos.symbol,
      nome: pos.nome,
      rawWeight: pos.rawWeight,
      dailyPrices: await getAssetHistory(pos.symbol, startDate, endDate),
    })),
  );

  const response = buildSensibilidadeCarteira({
    portfolioMonthlyReturns,
    assets: assetsWithHistory,
    windowMonths,
    calculadoEm: new Date(),
  });

  try {
    await prisma.portfolioSensibilidadeCache.upsert({
      where: { userId_windowMonths: { userId: targetUserId, windowMonths } },
      update: {
        portfolioHash,
        payload: response as unknown as object,
        computedAt: new Date(),
      },
      create: {
        userId: targetUserId,
        windowMonths,
        portfolioHash,
        payload: response as unknown as object,
      },
    });
  } catch (error) {
    const prismaError = error as Prisma.PrismaClientKnownRequestError;
    if (prismaError?.code !== 'P2021') throw error;
  }

  return NextResponse.json(response);
});
