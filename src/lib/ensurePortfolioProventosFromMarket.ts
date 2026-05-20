import { prisma } from '@/lib/prisma';
import { getDividends, isJcpType, getJcpIrrfRate } from '@/services/pricing/dividendService';

// UTC-safe: setHours(0) é local-TZ e gera offset diferentes entre ambientes
// (WSL BRT salva T03:00Z, Vercel UTC salva T00:00Z), quebrando dup-check.
// Date.UTC garante T00:00Z determinístico em qualquer ambiente.
const normalizeDateStart = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

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
  /**
   * `initial` (default): pula se o portfolio já tem qualquer provento (ativo
   *   ou dismissed). Usado pela rota `/api/ativos/[id]/editar` — só popula
   *   no primeiro acesso.
   * `sync`: pula o guard externo, depende do dup-check abaixo
   *   (`{dataPagamento, tipo, valorTotal}` — inclui dismissed pra respeitar
   *   delete do usuário). Usado pelo cron de sync de proventos.
   */
  mode?: 'initial' | 'sync';
}): Promise<void> => {
  const { portfolioId, userId, ticker, transactions, portfolioQuantity, portfolioLastUpdate } =
    params;
  const mode = params.mode ?? 'initial';

  if (!ticker.trim()) return;

  if (mode === 'initial') {
    const existing = await prisma.portfolioProvento.count({
      where: { portfolioId, userId },
    });
    if (existing > 0) return;
  }

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
    const dataComDay = d.dataCom ? normalizeDateStart(d.dataCom) : day;

    // Lacuna 1 (auditoria 2026-05-19): JCP tem IRRF retido na fonte. Alíquota
    // depende da data de pagamento — 15% até 31/12/2025 (Lei 9.249/95) e 17,5%
    // a partir de 01/01/2026 (LC 224/2025). Persistir aqui melhora a qualidade
    // do dado pra DAA/IR no futuro.
    const impostoRenda = isJcpType(d.tipo)
      ? Math.round(valorTotal * getJcpIrrfRate(day) * 100) / 100
      : null;

    // Match por (portfolioId, dataPagamento, tipo) — chave natural do evento.
    // Inclui dismissed pra respeitar deletes do usuário.
    const existing = await prisma.portfolioProvento.findFirst({
      where: {
        portfolioId,
        userId,
        dataPagamento: day,
        tipo: d.tipo,
      },
    });

    if (existing) {
      // Manual edits ganham preferência: nunca sobrescreve row source='manual'.
      // Source='brapi' refresca valor/dataCom/IR pra refletir correções da BRAPI
      // (caso típico: dedup retroativo somando duplicates que antes eram unitários).
      if (existing.source === 'brapi' && !existing.dismissed) {
        const needsUpdate =
          existing.valorTotal !== valorTotal ||
          existing.dataCom.getTime() !== dataComDay.getTime() ||
          existing.impostoRenda !== impostoRenda;
        if (needsUpdate) {
          await prisma.portfolioProvento.update({
            where: { id: existing.id },
            data: { valorTotal, dataCom: dataComDay, impostoRenda, quantidadeBase: quantidade },
          });
        }
      }
      continue;
    }

    await prisma.portfolioProvento.create({
      data: {
        portfolioId,
        userId,
        tipo: d.tipo,
        dataCom: dataComDay,
        dataPagamento: day,
        precificarPor: 'valor',
        valorTotal,
        quantidadeBase: quantidade,
        impostoRenda,
        source: 'brapi',
      },
    });
  }
};
