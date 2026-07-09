import { prisma } from '@/lib/prisma';
import { off2date } from './aposentadoria';

/**
 * Deriva os registros mensais de acompanhamento (aporte realizado + patrimônio
 * final) a partir de dados objetivos da carteira, eliminando a digitação manual:
 *
 * - `patFinal`  ← último snapshot diário (`portfolio_daily_snapshots`) do mês.
 * - `aporteReal`← fluxo líquido de transações do mês (compras − vendas),
 *                 excluindo reinvestimentos de proventos (não são capital novo).
 *                 Com ativos vinculados à aposentadoria (Portfolio.
 *                 vinculoAposentadoria), só as transações DELES contam; sem
 *                 vínculo, vale a carteira toda menos os ativos de sonho
 *                 (esse dinheiro pertence à meta do sonho).
 *
 * Só cobre meses já iniciados (até o mês corrente). Meses sem snapshot ficam
 * com `hasData=false` e NÃO são preenchidos — não inventamos patrimônio.
 */

export interface DerivedAcompanhamentoEntry {
  off: number;
  year: number;
  month: number; // 1-12
  aporteReal: number;
  patFinal: number | null;
  /** true quando há snapshot no mês (base para auto-preencher). */
  hasData: boolean;
}

export interface PlanoTrack {
  trackStartMonth: number;
  trackStartYear: number;
  idade: number;
  apos: number;
}

/** Compras de reinvestimento de proventos não são aporte de capital novo. */
const isReinvestimento = (notes: string | null | undefined): boolean => {
  if (!notes) return false;
  try {
    const parsed = JSON.parse(notes);
    return parsed?.operation?.action === 'reinvestimento';
  } catch {
    return false;
  }
};

/** Chave de mês-calendário em UTC (snapshots são gravados como UTC midnight). */
const monthKey = (year: number, month0: number): number => year * 12 + month0;

export async function deriveAcompanhamentoEntries(
  userId: string,
  plano: PlanoTrack,
): Promise<DerivedAcompanhamentoEntry[]> {
  const now = new Date();
  // Offset do mês corrente a partir do início do acompanhamento.
  const curOff =
    (now.getUTCFullYear() - plano.trackStartYear) * 12 +
    (now.getUTCMonth() - (plano.trackStartMonth - 1));
  const retM = Math.max(0, (plano.apos - plano.idade) * 12);
  const maxOff = retM > 0 ? Math.min(retM, curOff) : curOff;
  if (maxOff < 1) return [];

  const startDate = new Date(Date.UTC(plano.trackStartYear, plano.trackStartMonth - 1, 1));

  const [snapshots, transactions, vinculos] = await Promise.all([
    prisma.portfolioDailySnapshot.findMany({
      where: { userId, date: { gte: startDate, lte: now } },
      orderBy: { date: 'asc' },
      select: { date: true, totalValue: true },
    }),
    prisma.stockTransaction.findMany({
      where: { userId, type: { in: ['compra', 'venda'] }, date: { gte: startDate, lte: now } },
      select: {
        assetId: true,
        date: true,
        type: true,
        total: true,
        price: true,
        quantity: true,
        notes: true,
      },
    }),
    prisma.portfolio.findMany({
      where: {
        userId,
        OR: [{ vinculoAposentadoria: true }, { planejamentoObjetivoId: { not: null } }],
      },
      select: { assetId: true, vinculoAposentadoria: true, planejamentoObjetivoId: true },
    }),
  ]);

  const assetsAposentadoria = new Set(
    vinculos.filter((v) => v.vinculoAposentadoria && v.assetId).map((v) => v.assetId),
  );
  const assetsDeSonho = new Set(
    vinculos.filter((v) => v.planejamentoObjetivoId && v.assetId).map((v) => v.assetId),
  );

  // patFinal por mês: último snapshot do mês (ordenado asc → última escrita vence).
  const patByMonth = new Map<number, number>();
  for (const s of snapshots) {
    patByMonth.set(monthKey(s.date.getUTCFullYear(), s.date.getUTCMonth()), Number(s.totalValue));
  }

  // aporte líquido por mês (compras − vendas, excl. reinvestimento).
  const aporteByMonth = new Map<number, number>();
  for (const tx of transactions) {
    if (isReinvestimento(tx.notes)) continue;
    if (assetsAposentadoria.size > 0) {
      if (!tx.assetId || !assetsAposentadoria.has(tx.assetId)) continue;
    } else if (tx.assetId && assetsDeSonho.has(tx.assetId)) {
      continue;
    }
    const key = monthKey(tx.date.getUTCFullYear(), tx.date.getUTCMonth());
    const total = Number(tx.total) > 0 ? Number(tx.total) : tx.price * tx.quantity;
    const signed = tx.type === 'compra' ? total : -total;
    aporteByMonth.set(key, (aporteByMonth.get(key) ?? 0) + signed);
  }

  const out: DerivedAcompanhamentoEntry[] = [];
  for (let off = 1; off <= maxOff; off++) {
    const { year, month } = off2date(plano, off);
    const key = monthKey(year, month - 1);
    const patFinalRaw = patByMonth.get(key);
    const patFinal = patFinalRaw != null ? Math.round(patFinalRaw * 100) / 100 : null;
    const aporteReal = Math.round((aporteByMonth.get(key) ?? 0) * 100) / 100;
    out.push({ off, year, month, aporteReal, patFinal, hasData: patFinal != null });
  }
  return out;
}
