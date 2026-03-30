import { prisma } from '@/lib/prisma';
import { getDividends } from '@/services/pricing/dividendService';

const normalizeDateStart = (date: Date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const buildTimeline = (trans: { date: Date; quantity: number; type: string }[]) => {
  const sorted = [...trans].sort((a, b) => a.date.getTime() - b.date.getTime());
  const timeline: { date: number; quantity: number }[] = [];
  let currentQuantity = 0;
  sorted.forEach((t) => {
    currentQuantity += t.type === 'compra' ? t.quantity : -t.quantity;
    timeline.push({ date: t.date.getTime(), quantity: currentQuantity });
  });
  return timeline;
};

const getQuantityAtDate = (timeline: { date: number; quantity: number }[], date: number) => {
  if (timeline.length === 0) return 0;
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

/**
 * Se não há proventos salvos na posição, preenche a partir de `asset_dividend_history` / BRAPI
 * (mesma regra da página do ativo: só após a primeira compra e até hoje).
 */
export const ensurePortfolioProventosFromMarket = async (params: {
  portfolioId: string;
  userId: string;
  ticker: string;
  transactions: Array<{ date: Date; quantity: number; type: string }>;
  portfolioQuantity: number;
  portfolioLastUpdate: Date | null;
}): Promise<void> => {
  const { portfolioId, userId, ticker, transactions, portfolioQuantity, portfolioLastUpdate } =
    params;

  if (!ticker.trim()) return;

  const existing = await prisma.portfolioProvento.count({
    where: { portfolioId, userId },
  });
  if (existing > 0) return;

  const dividends = await getDividends(ticker, { useBrapiFallback: true });
  if (dividends.length === 0) return;

  const timeline = buildTimeline(transactions);
  const hoje = normalizeDateStart(new Date());
  const hojeMs = hoje.getTime();
  const compraTimes = transactions.filter((t) => t.type === 'compra').map((t) => t.date.getTime());
  const firstPurchaseDate =
    compraTimes.length > 0
      ? Math.min(...compraTimes)
      : portfolioLastUpdate
        ? normalizeDateStart(portfolioLastUpdate).getTime()
        : 0;

  for (const d of dividends) {
    const dMs = normalizeDateStart(d.date).getTime();
    if (dMs > hojeMs) continue;
    if (firstPurchaseDate > 0 && dMs < firstPurchaseDate) continue;

    const quantidade =
      timeline.length > 0 ? getQuantityAtDate(timeline, d.date.getTime()) : portfolioQuantity;
    if (quantidade <= 0) continue;

    const valorTotal = Math.round(quantidade * d.valorUnitario * 1e6) / 1e6;
    const day = normalizeDateStart(d.date);

    const dup = await prisma.portfolioProvento.findFirst({
      where: {
        portfolioId,
        userId,
        dataPagamento: day,
        tipo: d.tipo,
        valorTotal,
      },
    });
    if (dup) continue;

    await prisma.portfolioProvento.create({
      data: {
        portfolioId,
        userId,
        tipo: d.tipo,
        dataCom: day,
        dataPagamento: day,
        precificarPor: 'valor',
        valorTotal,
        quantidadeBase: quantidade,
        impostoRenda: null,
      },
    });
  }
};
