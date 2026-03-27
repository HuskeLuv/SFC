import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getAssetPrices } from '@/services/assetPriceService';
import { getDividends } from '@/services/dividendService';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';

interface ProventoData {
  id: string;
  data: string;
  symbol: string;
  ativo: string;
  tipo: string;
  classe: string;
  valor: number;
  quantidade: number;
  valorUnitario: number;
  status: 'realizado' | 'a_receber';
}

interface PortfolioAssetEntry {
  symbol: string;
  name: string;
  assetType: string;
  quantity: number;
  totalInvested: number;
  avgPrice: number;
  lastUpdate: Date;
  stockId?: string | null;
  assetId?: string | null;
}

interface TransactionPoint {
  date: number;
  quantity: number;
}

const BLOCKED_SYMBOL_PREFIXES = ['RESERVA-EMERG', 'RESERVA-OPORT', 'PERSONALIZADO'];

const isBlockedSymbol = (symbol: string) =>
  BLOCKED_SYMBOL_PREFIXES.some((prefix) => symbol.toUpperCase().startsWith(prefix));

const mapAssetTypeToClasse = (entry: PortfolioAssetEntry) => {
  const assetType = (entry.assetType || '').toLowerCase();
  const symbolUpper = entry.symbol.toUpperCase();
  const nameLower = entry.name.toLowerCase();

  if (assetType === 'stock') {
    return symbolUpper.endsWith('11') ? "FII's" : 'Ações';
  }

  if (assetType === 'bdr') {
    return 'Stocks';
  }

  if (assetType === 'fii') {
    return "FII's";
  }

  if (assetType === 'fund') {
    if (symbolUpper.endsWith('11') || nameLower.includes('fii') || nameLower.includes('imobili')) {
      return "FII's";
    }
    return 'FIM/FIA';
  }

  if (assetType === 'etf') {
    return "ETF's";
  }

  if (assetType === 'reit') {
    return "REIT's";
  }

  if (assetType === 'crypto' || assetType === 'currency') {
    return 'Moedas, Criptomoedas & outros';
  }

  if (assetType === 'bond') {
    return 'Renda Fixa & Fundos de Renda Fixa';
  }

  if (assetType === 'insurance') {
    return 'Previdência & Seguros';
  }

  if (assetType === 'opportunity') {
    return 'Reserva de Oportunidade';
  }

  if (assetType === 'emergency') {
    return 'Reserva de Emergência';
  }

  if (assetType === 'imovel') {
    return 'Imóveis Físicos';
  }

  if (assetType === 'personalizado') {
    return 'Personalizado';
  }

  return 'Outros';
};

const buildTimeline = (transactions: TransactionPoint[]) => {
  const sorted = [...transactions].sort((a, b) => a.date - b.date);
  const timeline: TransactionPoint[] = [];
  let currentQuantity = 0;

  sorted.forEach((transaction) => {
    currentQuantity += transaction.quantity;
    timeline.push({ date: transaction.date, quantity: currentQuantity });
  });

  return timeline;
};

const getQuantityAtDate = (timeline: TransactionPoint[], date: number) => {
  if (timeline.length === 0) {
    return 0;
  }

  let left = 0;
  let right = timeline.length - 1;
  let result = 0;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (timeline[mid].date <= date) {
      result = timeline[mid].quantity;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return Math.max(result, 0);
};

export async function GET(request: NextRequest) {
  try {
    const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);

    await logSensitiveEndpointAccess(
      request,
      payload,
      targetUserId,
      actingClient,
      '/api/analises/proventos',
      'GET',
    );

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const groupBy = searchParams.get('groupBy') || 'ativo'; // ativo, classe, tipo

    const portfolio = await prisma.portfolio.findMany({
      where: { userId: targetUserId },
      include: { stock: true, asset: true },
    });

    const portfolioAssets: PortfolioAssetEntry[] = portfolio
      .map((item) => {
        const symbol = item.stock?.ticker || item.asset?.symbol;
        if (!symbol || isBlockedSymbol(symbol)) {
          return null;
        }

        return {
          symbol,
          name: item.stock?.companyName || item.asset?.name || symbol,
          assetType: item.stock ? 'stock' : item.asset?.type || 'outros',
          quantity: item.quantity || 0,
          totalInvested: item.totalInvested || 0,
          avgPrice: item.avgPrice || 0,
          lastUpdate: item.lastUpdate,
          stockId: item.stockId,
          assetId: item.assetId,
        };
      })
      .filter(Boolean) as PortfolioAssetEntry[];

    if (portfolioAssets.length === 0) {
      return NextResponse.json({ proventos: [], grouped: {}, total: 0, media: 0 });
    }

    const stockIds = portfolioAssets.map((item) => item.stockId).filter(Boolean) as string[];
    const assetIds = portfolioAssets.map((item) => item.assetId).filter(Boolean) as string[];

    const transactions = await prisma.stockTransaction.findMany({
      where: {
        userId: targetUserId,
        OR: [
          stockIds.length ? { stockId: { in: stockIds } } : undefined,
          assetIds.length ? { assetId: { in: assetIds } } : undefined,
        ].filter(Boolean) as Prisma.StockTransactionWhereInput[],
      },
      include: {
        stock: true,
        asset: true,
      },
      orderBy: { date: 'asc' },
    });

    const transactionsBySymbol = new Map<string, TransactionPoint[]>();
    const purchaseDateBySymbol = new Map<string, number>();
    transactions.forEach((transaction) => {
      const symbol = transaction.stock?.ticker || transaction.asset?.symbol;
      if (!symbol || isBlockedSymbol(symbol)) {
        return;
      }

      const quantityChange =
        transaction.type === 'venda' ? -transaction.quantity : transaction.quantity;
      if (!transactionsBySymbol.has(symbol)) {
        transactionsBySymbol.set(symbol, []);
      }

      transactionsBySymbol.get(symbol)!.push({
        date: transaction.date.getTime(),
        quantity: quantityChange,
      });

      if (transaction.type === 'compra') {
        const purchaseTime = transaction.date.getTime();
        const existing = purchaseDateBySymbol.get(symbol);
        if (!existing || purchaseTime < existing) {
          purchaseDateBySymbol.set(symbol, purchaseTime);
        }
      }
    });

    const timelinesBySymbol = new Map<string, TransactionPoint[]>();
    transactionsBySymbol.forEach((points, symbol) => {
      timelinesBySymbol.set(symbol, buildTimeline(points));
    });

    portfolioAssets.forEach((asset) => {
      if (!purchaseDateBySymbol.has(asset.symbol)) {
        purchaseDateBySymbol.set(asset.symbol, asset.lastUpdate.getTime());
      }
      if (!timelinesBySymbol.has(asset.symbol) && asset.quantity > 0) {
        timelinesBySymbol.set(asset.symbol, [
          { date: asset.lastUpdate.getTime(), quantity: asset.quantity },
        ]);
      }
    });

    const symbols = portfolioAssets.map((asset) => asset.symbol);
    const quotes = await getAssetPrices(symbols, { useBrapiFallback: true });
    const assetValuesBySymbol = new Map<string, { invested: number; current: number }>();
    portfolioAssets.forEach((asset) => {
      const quote = quotes.get(asset.symbol);
      const price = quote || asset.avgPrice;
      const current = price > 0 ? price * asset.quantity : 0;
      const invested =
        asset.totalInvested > 0 ? asset.totalInvested : asset.avgPrice * asset.quantity;
      assetValuesBySymbol.set(asset.symbol, { invested, current });
    });

    const startDateTime = startDate ? new Date(startDate).getTime() : undefined;
    const endDateTime = endDate ? new Date(endDate).getTime() : undefined;

    const proventos: ProventoData[] = [];
    const hojeMs = Date.now();
    for (const asset of portfolioAssets) {
      const dividends = await getDividends(asset.symbol, { useBrapiFallback: true });
      if (dividends.length === 0) continue;

      const timeline = timelinesBySymbol.get(asset.symbol) || [];
      const classe = mapAssetTypeToClasse(asset);
      const purchaseDateTime = purchaseDateBySymbol.get(asset.symbol);

      dividends.forEach((d, index) => {
        const dateTime = d.date.getTime();
        if (purchaseDateTime && dateTime < purchaseDateTime) return;
        if (startDateTime && dateTime < startDateTime) return;
        if (endDateTime && dateTime > endDateTime) return;
        if (dateTime > hojeMs) return; // Apenas histórico (exclui a_receber)

        const quantidadeHistorica = getQuantityAtDate(timeline, dateTime);
        const quantidade = quantidadeHistorica > 0 ? quantidadeHistorica : asset.quantity;
        if (quantidade <= 0) return;

        const valor = quantidade * d.valorUnitario;
        proventos.push({
          id: `${asset.symbol}-${dateTime}-${index}`,
          data: d.date.toISOString(),
          symbol: asset.symbol,
          ativo: asset.name || asset.symbol,
          tipo: d.tipo,
          classe,
          valor,
          quantidade,
          valorUnitario: d.valorUnitario,
          status: 'realizado' as const,
        });
      });
    }

    proventos.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    // Agrupar dados conforme solicitado
    const groupedData: Record<
      string,
      {
        total: number;
        count: number;
        items: ProventoData[];
        invested: number;
        currentValue: number;
        dividendYield: number;
        yoc: number;
      }
    > = {};
    const groupAssets = new Map<string, Set<string>>();

    proventos.forEach((provento) => {
      let key = '';

      switch (groupBy) {
        case 'ativo':
          key = provento.ativo;
          break;
        case 'classe':
          key = provento.classe;
          break;
        case 'tipo':
          key = provento.tipo;
          break;
        default:
          key = provento.ativo;
      }

      if (!groupedData[key]) {
        groupedData[key] = {
          total: 0,
          count: 0,
          items: [],
          invested: 0,
          currentValue: 0,
          dividendYield: 0,
          yoc: 0,
        };
      }

      groupedData[key].total += provento.valor;
      groupedData[key].count += 1;
      groupedData[key].items.push(provento);

      if (!groupAssets.has(key)) {
        groupAssets.set(key, new Set());
      }
      if (provento.symbol) {
        groupAssets.get(key)!.add(provento.symbol);
      }
    });

    Object.entries(groupedData).forEach(([key, data]) => {
      const symbolsSet = groupAssets.get(key) || new Set();
      symbolsSet.forEach((symbol) => {
        const values = assetValuesBySymbol.get(symbol);
        if (!values) return;
        data.invested += values.invested;
        data.currentValue += values.current;
      });

      data.dividendYield = data.currentValue > 0 ? (data.total / data.currentValue) * 100 : 0;
      data.yoc = data.invested > 0 ? (data.total / data.invested) * 100 : 0;
    });

    const monthlySummary: Record<string, { total: number; count: number }> = {};
    const yearlySummary: Record<string, { total: number; count: number }> = {};
    proventos.forEach((provento) => {
      const date = new Date(provento.data);
      if (Number.isNaN(date.getTime())) return;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const yearKey = `${date.getFullYear()}`;

      if (!monthlySummary[monthKey]) {
        monthlySummary[monthKey] = { total: 0, count: 0 };
      }
      if (!yearlySummary[yearKey]) {
        yearlySummary[yearKey] = { total: 0, count: 0 };
      }
      monthlySummary[monthKey].total += provento.valor;
      monthlySummary[monthKey].count += 1;
      yearlySummary[yearKey].total += provento.valor;
      yearlySummary[yearKey].count += 1;
    });

    return NextResponse.json({
      proventos,
      grouped: groupedData,
      monthly: monthlySummary,
      yearly: yearlySummary,
      total: proventos.reduce((sum, p) => sum + p.valor, 0),
      media:
        proventos.length > 0
          ? proventos.reduce((sum, p) => sum + p.valor, 0) / proventos.length
          : 0,
    });
  } catch (error) {
    console.error('Erro ao buscar proventos:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados de proventos' }, { status: 500 });
  }
}
