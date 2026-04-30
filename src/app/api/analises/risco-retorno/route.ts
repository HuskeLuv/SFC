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
import { computePortfolioLiveTotals } from '@/services/portfolio/portfolioLiveTotals';
import { getAssetHistory, isNonMarketSymbol } from '@/services/pricing/assetPriceService';
import {
  computeBeta,
  extractMonthlyCloses,
  monthlyReturnsFromCloses,
} from '@/services/analises/sensibilidadeCarteira';

/** Janela para cálculo de beta: 24 meses, mesma usada em sensibilidade-carteira. */
const BETA_WINDOW_MONTHS = 24;
const IBOV_SYMBOL = '^BVSP';
/** TTL do cache — carteira estável serve do cache por até 24h. */
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Versão do algoritmo de cálculo. Bumpar invalida todo o cache existente sem precisar
 * mexer no DB: o hash entra como prefixo nas chaves, então linhas antigas viram órfãs
 * e qualquer request recomputa do zero. Bump quando a fórmula de beta/risco mudar de
 * forma observável aos usuários (ex.: 1 → 2 quando beta migrou de mensal para diário).
 */
const ALGORITHM_VERSION = 2;

/** Hash estável da composição: invalida o cache quando posição/preço médio muda. */
function computePortfolioHash(
  items: Array<{ symbol: string; quantity: number; avgPrice: number }>,
): string {
  const normalized = items
    .filter((i) => i.symbol)
    .map((i) => `${i.symbol}:${i.quantity}:${i.avgPrice}`)
    .sort()
    .join('|');
  const payload = `v${ALGORITHM_VERSION}|${normalized}`;
  return createHash('sha256').update(payload).digest('hex');
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
  /** Retorno anualizado do ativo na janela de beta (24m). Undefined quando histórico insuficiente. */
  retornoAnual?: number;
  /** CDI no mesmo período do retorno do ativo. */
  retornoCDI?: number;
  /** Volatilidade anualizada (×√252) dos retornos diários do ativo. */
  volatilidade?: number;
  /** Sharpe = (retornoAnual - retornoCDI) / volatilidade. */
  sharpe?: number;
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

  // O TWR cumulativo antes do primeiro ponto da série é, por definição, 0%
  // (factor=1). Incluir o primeiro mês com twrAnterior=0 garante que o retorno
  // mensal do mês de início entre na composição — sem isso, `calcularRetorno`
  // descarta o primeiro mês inteiro e devolve só a variação do segundo em
  // diante (na carteira do kinvo, ignora +65% de março e mostra só +8% de abril).
  for (let i = 0; i < meses.length; i++) {
    const twrAnterior = i === 0 ? 1 : 1 + meses[i - 1][1].twrAcumulado / 100;
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
 * Extrai retornos diários a partir do TWR acumulado, mantendo a data para filtragem por ano.
 */
function calcularRetornosDiariosTWR(
  historicoTWR: Array<{ data: number; value: number }>,
): Array<{ data: number; retorno: number }> {
  const retornos: Array<{ data: number; retorno: number }> = [];
  for (let i = 1; i < historicoTWR.length; i++) {
    const twrAnterior = 1 + historicoTWR[i - 1].value / 100;
    const twrAtual = 1 + historicoTWR[i].value / 100;
    if (twrAnterior > 0) {
      retornos.push({ data: historicoTWR[i].data, retorno: twrAtual / twrAnterior - 1 });
    }
  }
  return retornos;
}

/**
 * Volatilidade anualizada — desvio padrão amostral × √(observações por ano).
 * Para retornos diários (~252 dias úteis/ano) o multiplicador é √252; para mensais, √12.
 * Usar diários produz valores mais alinhados com o padrão de mercado (Kinvo, B3, etc.),
 * pois retornos mensais inflam a vol amostral em janelas curtas.
 */
function calcularVolatilidade(retornos: number[], obsPorAno: number): number {
  if (retornos.length < 2) return 0;
  const media = retornos.reduce((a, b) => a + b, 0) / retornos.length;
  const variancia = retornos.reduce((sum, r) => sum + (r - media) ** 2, 0) / (retornos.length - 1);
  return Math.sqrt(variancia) * Math.sqrt(obsPorAno);
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
 * - Retorno e CDI usam retornos mensais (composição geométrica → anualização suave).
 * - Volatilidade usa retornos diários (×√252) — convenção de mercado, evita inflar a
 *   dispersão por causa da granularidade mensal.
 */
function calcularMetricas(
  retornosMensais: number[],
  retornosDiarios: number[],
  cdiPeriodo: number,
): RiscoRetornoMetrics {
  const retornoAnual = calcularRetorno(retornosMensais);
  const volatilidade = calcularVolatilidade(retornosDiarios, 252) * 100;
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

/**
 * Constrói o fator mensal acumulado do CDI a partir das taxas diárias.
 * Map de 'YYYY-MM' → ∏(1 + cdi_dia) do mês.
 */
function buildCdiFatorMensal(
  cdiRecords: Array<{ date: Date; value: unknown }>,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const r of cdiRecords) {
    const d = r.date;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const prev = result.get(key) ?? 1;
    result.set(key, prev * (1 + Number(r.value)));
  }
  return result;
}

/**
 * CDI acumulado para os mesmos meses cobertos pelos retornos da carteira, com a mesma
 * regra de anualização do `calcularRetorno`. Garante que o Sharpe compare períodos iguais
 * (ex.: carteira de 6 meses → CDI dos mesmos 6 meses, sem anualizar).
 */
function calcularCdiCarteira(
  retornosMensais: Array<{ year: number; month: number }>,
  cdiFatorMensal: Map<string, number>,
): number {
  if (retornosMensais.length === 0) return 0;
  const product = retornosMensais.reduce((acc, r) => {
    const key = `${r.year}-${String(r.month).padStart(2, '0')}`;
    const factor = cdiFatorMensal.get(key) ?? 1;
    return acc * factor;
  }, 1);
  const meses = retornosMensais.length;
  if (meses >= 12) {
    return (product ** (12 / meses) - 1) * 100;
  }
  return (product - 1) * 100;
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

  // Pricer compartilhado: marcação na curva (CDI/IPCA/Tesouro PU) para FI no histórico.
  // Reusa fixedIncomeAssets já carregado pra evitar query duplicada.
  const fiPricer = await createFixedIncomePricer(targetUserId, {
    preloadedAssets: fixedIncomeAssets as unknown as FixedIncomeAssetWithAsset[],
  });

  // Saldo bruto = valor de mercado real (cotações + FI marcado na curva). Usar
  // `quantity * avgPrice` aqui combinado com `patchLastDayWithLiveTotals` cravava o último
  // dia em custo de aquisição, criando um penhasco artificial e inflando volatilidade.
  const { saldoBruto, valorAplicado } = await computePortfolioLiveTotals({
    portfolio,
    fixedIncomeAssets: fixedIncomeAssets as unknown as FixedIncomeAssetWithAsset[],
    investmentsExclReservas: cashflowInvestments,
    fiPricer,
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
    implicitCdiValueSeriesBuilder: fiPricer.buildImplicitCdiValueSeries,
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

  // Fator mensal do CDI: alimenta tanto a carteira (período = retornos disponíveis) quanto
  // os anos isolados, sempre comparando exatamente os mesmos meses do retorno do investidor.
  const cdiFatorMensal = buildCdiFatorMensal(cdiRecords);

  // Calcula retornos mensais (retorno + CDI) e diários (volatilidade) a partir do TWR.
  const retornosMensais = calcularRetornosMensaisTWR(built.historicoTWR);
  const retornosDiarios = calcularRetornosDiariosTWR(built.historicoTWR);

  // Métricas gerais (carteira — todos os meses disponíveis). CDI alinhado ao mesmo período
  // dos retornos: para 6 meses, comparamos contra CDI de 6 meses; para >=12, anualizamos
  // ambos. O cdi 12m anualizado anterior superestimava a referência em períodos curtos e
  // distorcia o índice Sharpe.
  const todosRetornosMensais = retornosMensais.map((r) => r.retorno);
  const todosRetornosDiarios = retornosDiarios.map((r) => r.retorno);
  const cdiCarteira = calcularCdiCarteira(retornosMensais, cdiFatorMensal);
  const carteira = calcularMetricas(todosRetornosMensais, todosRetornosDiarios, cdiCarteira);

  // Métricas por ano
  const anosSet = new Set(retornosMensais.map((r) => r.year));
  const anoAtual = new Date().getFullYear();
  anosSet.add(anoAtual);
  const anosDisponiveis = Array.from(anosSet).sort((a, b) => b - a);

  const anual: Record<number, RiscoRetornoMetrics> = {};
  for (const ano of anosDisponiveis) {
    const retornosMesDoAno = retornosMensais.filter((r) => r.year === ano).map((r) => r.retorno);
    const retornosDiaDoAno = retornosDiarios
      .filter((r) => new Date(r.data).getFullYear() === ano)
      .map((r) => r.retorno);

    // CDI real acumulado do ano (jan 1 até dez 31 ou hoje)
    const inicioAno = new Date(ano, 0, 1);
    const fimAno = ano === anoAtual ? new Date() : new Date(ano, 11, 31);
    const cdiDoAno = calcularCdiPeriodo(cdiRecords, inicioAno, fimAno);

    anual[ano] = calcularMetricas(retornosMesDoAno, retornosDiaDoAno, cdiDoAno);
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
  // Métricas por ativo (sharpe, vol, retornos) reaproveitando o histórico já carregado
  // pra beta. Evita uma segunda rodada de getAssetHistory; útil pra ranking de risco/retorno
  // por posição (ex.: "qual ativo tem o melhor sharpe").
  const metricsBySymbol = new Map<
    string,
    Pick<SensibilidadeItem, 'retornoAnual' | 'retornoCDI' | 'volatilidade' | 'sharpe'>
  >();
  if (ibovHistory.length > 0) {
    const entries = await Promise.all(
      marketSymbols.map(async (symbol) => {
        const assetHistory = await getAssetHistory(symbol, betaStartDate, betaEndDate);
        const beta = computeBeta(assetHistory, ibovHistory);
        return { symbol, beta, assetHistory };
      }),
    );
    for (const { symbol, beta, assetHistory } of entries) {
      if (beta !== null) betaBySymbol.set(symbol, beta);

      // Sharpe/vol/retorno por ativo: derivados do mesmo histórico de preços usado
      // pra beta. Só calcula quando há pelo menos 2 retornos mensais (3 fechamentos).
      if (assetHistory.length < 30) continue;
      const monthlyCloses = extractMonthlyCloses(assetHistory);
      const monthlyReturns = monthlyReturnsFromCloses(monthlyCloses);
      if (monthlyReturns.size < 2) continue;
      const retornosMensaisAtivo = Array.from(monthlyReturns.values());

      // Retornos diários: razão entre fechamentos consecutivos.
      const dailyReturns: number[] = [];
      for (let i = 1; i < assetHistory.length; i++) {
        const prev = assetHistory[i - 1].value;
        const curr = assetHistory[i].value;
        if (prev > 0 && curr > 0) dailyReturns.push(curr / prev - 1);
      }
      if (dailyReturns.length < 2) continue;

      // CDI alinhado aos meses do retorno do ativo (mesma regra que aplicamos pra carteira).
      const monthsAtivo = Array.from(monthlyReturns.keys()).sort();
      const cdiPorAtivo = (() => {
        if (monthsAtivo.length === 0) return 0;
        const product = monthsAtivo.reduce((acc, key) => {
          const factor = cdiFatorMensal.get(key) ?? 1;
          return acc * factor;
        }, 1);
        const meses = monthsAtivo.length;
        if (meses >= 12) return (product ** (12 / meses) - 1) * 100;
        return (product - 1) * 100;
      })();

      const m = calcularMetricas(retornosMensaisAtivo, dailyReturns, cdiPorAtivo);
      metricsBySymbol.set(symbol, {
        retornoAnual: m.retornoAnual,
        retornoCDI: m.retornoCDI,
        volatilidade: m.volatilidade,
        sharpe: m.sharpe,
      });
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
        ...metricsBySymbol.get(ticker),
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
