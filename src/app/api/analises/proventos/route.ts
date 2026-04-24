import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getAssetPrices } from '@/services/pricing/assetPriceService';
import { getDividends, getCorporateActions } from '@/services/pricing/dividendService';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';

import { withErrorHandler } from '@/utils/apiErrorHandler';
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
    return 'Previdência e Seguros';
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

export const GET = withErrorHandler(async (request: NextRequest) => {
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

  // Proventos cadastrados manualmente (inclui JCP com IRRF separado).
  // Não vêm da BRAPI; precisam entrar no agregado para que o YoC reflita o
  // total real recebido pelo usuário.
  const manualProventos = portfolio.length
    ? await prisma.portfolioProvento.findMany({
        where: { userId: targetUserId, portfolioId: { in: portfolio.map((p) => p.id) } },
      })
    : [];
  const portfolioById = new Map(portfolio.map((p) => [p.id, p]));

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
    return NextResponse.json({
      proventos: [],
      grouped: {},
      monthly: {},
      yearly: {},
      total: 0,
      media: 0,
    });
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
    const invested = asset.avgPrice * asset.quantity;
    assetValuesBySymbol.set(asset.symbol, { invested, current });
  });

  const startDateTime = startDate ? new Date(startDate).getTime() : undefined;
  // Incluir o dia inteiro do endDate (fim do dia)
  const endDateTime = endDate
    ? new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000 - 1).getTime()
    : undefined;

  const proventos: ProventoData[] = [];
  const hojeMs = Date.now();
  const allDividends = await Promise.all(
    portfolioAssets.map(async (asset) => {
      const dividends = await getDividends(asset.symbol, { useBrapiFallback: true });
      return { asset, dividends };
    }),
  );
  for (const { asset, dividends } of allDividends) {
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
      // Usar quantidade histórica; fallback para atual apenas se não há timeline (sem transações)
      const quantidade =
        quantidadeHistorica > 0 ? quantidadeHistorica : timeline.length === 0 ? asset.quantity : 0;
      if (quantidade <= 0) return;

      const valor = Math.round(quantidade * d.valorUnitario * 100) / 100;
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

  // Anexa proventos manuais (PortfolioProvento) — bruto via valorTotal.
  manualProventos.forEach((mp) => {
    const pf = portfolioById.get(mp.portfolioId);
    const symbol = pf?.stock?.ticker || pf?.asset?.symbol;
    if (!symbol || isBlockedSymbol(symbol)) return;
    const asset = portfolioAssets.find((a) => a.symbol === symbol);
    if (!asset) return;

    const dateTime = mp.dataPagamento.getTime();
    if (dateTime > hojeMs) return;
    if (startDateTime && dateTime < startDateTime) return;
    if (endDateTime && dateTime > endDateTime) return;

    const quantidade = mp.quantidadeBase || 0;
    const valor = Math.round(mp.valorTotal * 100) / 100;
    proventos.push({
      id: `manual-${mp.id}`,
      data: mp.dataPagamento.toISOString(),
      symbol,
      ativo: asset.name || symbol,
      tipo: mp.tipo,
      classe: mapAssetTypeToClasse(asset),
      valor,
      quantidade,
      valorUnitario: quantidade > 0 ? mp.valorTotal / quantidade : 0,
      status: 'realizado' as const,
    });
  });

  proventos.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  // Janela trailing-12m por símbolo — usado para YoC/DY por ativo (convenção do
  // mercado), independente do filtro que o usuário aplicou na página. Aplica as
  // mesmas regras do feed principal (data de compra e quantidade histórica).
  const doze_m_ms_row = hojeMs - 365 * 24 * 60 * 60 * 1000;
  const ult12mBySymbol = new Map<string, number>();
  const addUlt12m = (symbol: string, valor: number) => {
    ult12mBySymbol.set(symbol, (ult12mBySymbol.get(symbol) || 0) + valor);
  };
  for (const { asset, dividends } of allDividends) {
    const timeline = timelinesBySymbol.get(asset.symbol) || [];
    const purchaseDateTime = purchaseDateBySymbol.get(asset.symbol);
    for (const d of dividends) {
      const dateTime = d.date.getTime();
      if (dateTime > hojeMs || dateTime < doze_m_ms_row) continue;
      if (purchaseDateTime && dateTime < purchaseDateTime) continue;
      const qtdHist = getQuantityAtDate(timeline, dateTime);
      const quantidade = qtdHist > 0 ? qtdHist : timeline.length === 0 ? asset.quantity : 0;
      if (quantidade <= 0) continue;
      addUlt12m(asset.symbol, quantidade * d.valorUnitario);
    }
  }
  manualProventos.forEach((mp) => {
    const pf = portfolioById.get(mp.portfolioId);
    const symbol = pf?.stock?.ticker || pf?.asset?.symbol;
    if (!symbol || isBlockedSymbol(symbol)) return;
    const dateTime = mp.dataPagamento.getTime();
    if (dateTime > hojeMs || dateTime < doze_m_ms_row) return;
    addUlt12m(symbol, mp.valorTotal);
  });

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
      // Enriquecimento para exibição tipo Kinvo (preenchido apenas quando groupBy==='ativo')
      classe?: string;
      quantidadeAtual?: number;
      precoMedio?: number;
      cotacaoAtual?: number;
      ultimoProvento?: number;
      magicNumber?: number;
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
    let ult12mTotal = 0;
    symbolsSet.forEach((symbol) => {
      const values = assetValuesBySymbol.get(symbol);
      if (values) {
        data.invested += values.invested;
        data.currentValue += values.current;
      }
      ult12mTotal += ult12mBySymbol.get(symbol) || 0;
    });

    // YoC e Dividend Yield seguem convenção do mercado: sempre últimos 12 meses,
    // independente do filtro de período (que alimenta apenas "Total Acumulado").
    data.dividendYield = data.currentValue > 0 ? (ult12mTotal / data.currentValue) * 100 : 0;
    data.yoc = data.invested > 0 ? (ult12mTotal / data.invested) * 100 : 0;

    // Enriquecer grupos por ATIVO com campos esperados pela tabela estilo Kinvo
    if (groupBy === 'ativo') {
      const symbol = data.items[0]?.symbol;
      if (!symbol) return;
      const asset = portfolioAssets.find((a) => a.symbol === symbol);
      if (!asset) return;

      const classe = mapAssetTypeToClasse(asset);
      const quote = quotes.get(symbol) ?? asset.avgPrice;

      // Último provento por cota (ordenado por data asc)
      const sortedItems = [...data.items].sort(
        (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime(),
      );
      const ultimoProvento = sortedItems[sortedItems.length - 1]?.valorUnitario ?? 0;

      data.classe = classe;
      data.quantidadeAtual = asset.quantity;
      data.precoMedio = asset.avgPrice;
      data.cotacaoAtual = quote;
      data.ultimoProvento = ultimoProvento;

      // Magic number: apenas FIIs — ceil(cotação / provento_médio_mensal_por_cota)
      if (classe === "FII's" && asset.quantity > 0 && quote > 0) {
        // Calcula média mensal por cota usando últimos 12m deste ativo
        const doze_m_ms = Date.now() - 365 * 24 * 60 * 60 * 1000;
        const ult12mTotalAtivo = data.items
          .filter((item) => new Date(item.data).getTime() >= doze_m_ms)
          .reduce((sum, item) => sum + item.valor, 0);
        const mediaMensalTotalAtivo = ult12mTotalAtivo / 12;
        const mediaMensalPorCota = mediaMensalTotalAtivo / asset.quantity;
        if (mediaMensalPorCota > 0) {
          data.magicNumber = Math.ceil(quote / mediaMensalPorCota);
        }
      }
    }
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

  const totalProventos = proventos.reduce((sum, p) => sum + p.valor, 0);
  const mesesComProventos = Object.keys(monthlySummary).length;
  const mediaMensal = mesesComProventos > 0 ? totalProventos / mesesComProventos : 0;

  // ============================================================================
  // KPI block — valores independentes do filtro de período do usuário quando
  // possível (para o card "Últimos 12 meses" sempre refletir o mesmo recorte).
  // ============================================================================
  const hojeKpi = new Date();
  hojeKpi.setHours(0, 0, 0, 0);
  const hojeKpiMs = hojeKpi.getTime();
  const doze_m_ms = hojeKpiMs - 365 * 24 * 60 * 60 * 1000;
  const primeiroDiaMes = new Date(hojeKpi.getFullYear(), hojeKpi.getMonth(), 1).getTime();
  const ultimoInstanteMes =
    new Date(hojeKpi.getFullYear(), hojeKpi.getMonth() + 1, 1).getTime() - 1;

  // Proventos a receber (futuros, status='a_receber')
  let aReceberFuturo = 0;
  let aReceberEsseMes = 0;
  for (const { asset, dividends } of allDividends) {
    for (const d of dividends) {
      const dateTime = d.date.getTime();
      if (dateTime <= hojeKpiMs) continue;
      const quantidade = asset.quantity;
      if (quantidade <= 0) continue;
      const valor = quantidade * d.valorUnitario;
      aReceberFuturo += valor;
      if (dateTime >= primeiroDiaMes && dateTime <= ultimoInstanteMes) {
        aReceberEsseMes += valor;
      }
    }
  }
  // Proventos manuais a receber (já vêm com valorTotal pronto)
  manualProventos.forEach((mp) => {
    const pf = portfolioById.get(mp.portfolioId);
    const symbol = pf?.stock?.ticker || pf?.asset?.symbol;
    if (!symbol || isBlockedSymbol(symbol)) return;
    const dateTime = mp.dataPagamento.getTime();
    if (dateTime <= hojeKpiMs) return;
    aReceberFuturo += mp.valorTotal;
    if (dateTime >= primeiroDiaMes && dateTime <= ultimoInstanteMes) {
      aReceberEsseMes += mp.valorTotal;
    }
  });

  // Histórico completo (sem filtro de startDate/endDate) — usamos para recortes fixos de 12m
  const proventosRealizadosTodos: { data: number; valor: number }[] = [];
  for (const { asset, dividends } of allDividends) {
    const timeline = timelinesBySymbol.get(asset.symbol) || [];
    const purchaseDateTime = purchaseDateBySymbol.get(asset.symbol);
    for (const d of dividends) {
      const dateTime = d.date.getTime();
      if (dateTime > hojeKpiMs) continue;
      if (purchaseDateTime && dateTime < purchaseDateTime) continue;
      const qtdHist = getQuantityAtDate(timeline, dateTime);
      const quantidade = qtdHist > 0 ? qtdHist : timeline.length === 0 ? asset.quantity : 0;
      if (quantidade <= 0) continue;
      proventosRealizadosTodos.push({ data: dateTime, valor: quantidade * d.valorUnitario });
    }
  }

  // Proventos manuais (PortfolioProvento) entram no histórico realizado
  manualProventos.forEach((mp) => {
    const pf = portfolioById.get(mp.portfolioId);
    const symbol = pf?.stock?.ticker || pf?.asset?.symbol;
    if (!symbol || isBlockedSymbol(symbol)) return;
    const dateTime = mp.dataPagamento.getTime();
    if (dateTime > hojeKpiMs) return;
    proventosRealizadosTodos.push({ data: dateTime, valor: mp.valorTotal });
  });

  const rendaUlt12m = proventosRealizadosTodos
    .filter((p) => p.data >= doze_m_ms)
    .reduce((s, p) => s + p.valor, 0);
  const mediaMensalUlt12m = rendaUlt12m / 12;

  let totalInvestidoAtual = 0;
  assetValuesBySymbol.forEach((v) => {
    totalInvestidoAtual += v.invested;
  });

  const aportesUlt12m = transactions
    .filter((t) => t.type === 'compra' && t.date.getTime() >= doze_m_ms)
    .reduce((s, t) => {
      const total = Number(t.total);
      return s + (Number.isFinite(total) && total > 0 ? total : t.price * t.quantity);
    }, 0);

  // Média mensal do período filtrado: usa o intervalo [startDate, endDate] se ambos definidos;
  // caso contrário, mantém o comportamento antigo (meses com proventos efetivos).
  let mediaMensalPeriodo = mediaMensal;
  if (startDateTime && endDateTime) {
    const startObj = new Date(startDateTime);
    const endObj = new Date(endDateTime);
    const months =
      (endObj.getFullYear() - startObj.getFullYear()) * 12 +
      (endObj.getMonth() - startObj.getMonth()) +
      1;
    if (months > 0) mediaMensalPeriodo = totalProventos / months;
  }

  const yocPeriodo = totalInvestidoAtual > 0 ? (totalProventos / totalInvestidoAtual) * 100 : 0;
  const yocUlt12m = totalInvestidoAtual > 0 ? (rendaUlt12m / totalInvestidoAtual) * 100 : 0;

  const kpis = {
    totalInvestido: Math.round(totalInvestidoAtual * 100) / 100,
    aportesUlt12m: Math.round(aportesUlt12m * 100) / 100,
    rendaAcumulada: {
      periodo: Math.round(totalProventos * 100) / 100,
      ult12m: Math.round(rendaUlt12m * 100) / 100,
    },
    mediaMensal: {
      periodo: Math.round(mediaMensalPeriodo * 100) / 100,
      ult12m: Math.round(mediaMensalUlt12m * 100) / 100,
    },
    yoc: {
      periodo: Math.round(yocPeriodo * 100) / 100,
      ult12m: Math.round(yocUlt12m * 100) / 100,
    },
    aReceber: {
      futuro: Math.round(aReceberFuturo * 100) / 100,
      esseMes: Math.round(aReceberEsseMes * 100) / 100,
    },
  };

  // Fetch corporate actions (splits/inplits/bonuses) for all portfolio assets
  const allCorporateActions = await Promise.all(
    portfolioAssets.map(async (asset) => {
      const actions = await getCorporateActions(asset.symbol, { useBrapiFallback: true });
      return actions.map((a) => ({
        symbol: asset.symbol,
        ativo: asset.name || asset.symbol,
        classe: mapAssetTypeToClasse(asset),
        data: a.date.toISOString(),
        type: a.type,
        factor: a.factor,
        completeFactor: a.completeFactor,
      }));
    }),
  );
  const corporateActions = allCorporateActions
    .flat()
    .filter((a) => {
      const dateTime = new Date(a.data).getTime();
      if (startDateTime && dateTime < startDateTime) return false;
      if (endDateTime && dateTime > endDateTime) return false;
      return true;
    })
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  return NextResponse.json({
    proventos,
    grouped: groupedData,
    monthly: monthlySummary,
    yearly: yearlySummary,
    total: Math.round(totalProventos * 100) / 100,
    media: Math.round(mediaMensal * 100) / 100,
    corporateActions,
    kpis,
  });
});
