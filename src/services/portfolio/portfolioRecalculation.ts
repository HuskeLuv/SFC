import { prisma } from '@/lib/prisma';
import { normalizeDateStart } from './patrimonioHistoricoBuilder';
import { deleteTtlCacheKeyPrefix } from '@/lib/simpleTtlCache';

/**
 * Source of truth para os totais do Portfolio: lê todas as StockTransactions do
 * ativo, recomputa quantity/avgPrice/totalInvested via custo médio ponderado, e
 * sincroniza tabelas denormalizadas (FixedIncomeAsset.investedAmount).
 *
 * Use depois de QUALQUER mutação que afete a lista de transações de um ativo:
 *   - PATCH/DELETE em /api/historico/transacao/[id]
 *   - novo aporte/resgate em /api/carteira/operacao | /api/carteira/aporte | /api/carteira/resgate
 *   - ajuste manual de valor (imoveis-bens, renda-fixa, fim-fia) — quando feito
 *     via inserção de transação tipo "ajuste manual"
 *
 * Quando todas as transações foram removidas, deleta o Portfolio e o
 * FixedIncomeAsset acoplado pra evitar órfãos.
 *
 * Custo médio ponderado:
 *   - compra acumula qty + custo total
 *   - venda remove qty E o CUSTO PROPORCIONAL (qty * avg_at_sale), não o valor
 *     da venda — subtrair receita distorce o avgPrice quando há vendas no histórico.
 *
 * `recomputeSnapshotsFrom` (Bug #02): quando uma data é passada, os snapshots
 * diários (portfolio_daily_snapshots / portfolio_performance) a partir daquele
 * dia são removidos e o cache em memória do /carteira/resumo é invalidado. Sem
 * isso, a série histórica de MWR/TWR mantém o cashflow antigo e produz saltos
 * verticais ou retornos impossíveis (ex.: 163% num mês). O loader cai no fallback
 * de cálculo ao vivo até o cron diário repovoar a tabela.
 */
export async function recalculatePortfolioFromTransactions(params: {
  targetUserId: string;
  assetId: string | null;
  stockId: string | null;
  portfolioId: string;
  recomputeSnapshotsFrom?: Date;
}): Promise<void> {
  const { targetUserId, assetId, stockId, portfolioId, recomputeSnapshotsFrom } = params;

  const txWhere: { userId: string; assetId?: string; stockId?: string } = {
    userId: targetUserId,
  };
  if (assetId) txWhere.assetId = assetId;
  else if (stockId) txWhere.stockId = stockId;

  const allTransactions = await prisma.stockTransaction.findMany({
    where: txWhere,
    orderBy: { date: 'asc' },
  });

  if (allTransactions.length === 0) {
    if (assetId) {
      await prisma.fixedIncomeAsset.deleteMany({ where: { userId: targetUserId, assetId } });
    }
    await prisma.portfolio.delete({
      where: { id: portfolioId },
    });
    if (recomputeSnapshotsFrom) {
      await invalidatePortfolioSnapshots(targetUserId, recomputeSnapshotsFrom);
    }
    return;
  }

  let runningQty = 0;
  let runningCost = 0;
  for (const tx of allTransactions) {
    const qty = Number(tx.quantity);
    const price = Number(tx.price);
    const total = Number(tx.total);
    const txValue = total > 0 ? total : qty * price;

    if (tx.type === 'compra') {
      runningQty += qty;
      runningCost += txValue;
    } else if (runningQty > 0) {
      const avgAtSale = runningCost / runningQty;
      const sellQty = Math.min(qty, runningQty);
      runningCost -= avgAtSale * sellQty;
      runningQty -= sellQty;
    }
  }

  const avgPrice = runningQty > 0 ? runningCost / runningQty : 0;

  await prisma.portfolio.update({
    where: { id: portfolioId },
    data: {
      quantity: runningQty,
      avgPrice,
      totalInvested: runningCost,
      lastUpdate: new Date(),
    },
  });

  // Renda-fixa/Tesouro: FixedIncomeAsset.investedAmount é a fonte de verdade
  // exibida em /carteira/renda-fixa e usada pela marcação na curva (fixedIncomePricing).
  // Sem este sync, editar qty/price/total de uma transação atualiza só o Portfolio
  // e a tabela continua mostrando o valor antigo. Para tickers sem renda-fixa
  // associada, updateMany é no-op.
  if (assetId) {
    await prisma.fixedIncomeAsset.updateMany({
      where: { userId: targetUserId, assetId },
      data: { investedAmount: runningCost },
    });
  }

  if (recomputeSnapshotsFrom) {
    await invalidatePortfolioSnapshots(targetUserId, recomputeSnapshotsFrom);
  }
}

/**
 * Apaga snapshots diários e performance TWR a partir do dia da edição.
 * Também invalida o cache TTL em memória do /carteira/resumo do usuário.
 * O loader detecta a quebra de cobertura (`coverageOk=false`) e cai no
 * builder ao vivo até o cron diário repopular o snapshot.
 */
async function invalidatePortfolioSnapshots(userId: string, fromDate: Date): Promise<void> {
  const cutoff = normalizeDateStart(fromDate);
  await Promise.all([
    prisma.portfolioDailySnapshot.deleteMany({
      where: { userId, date: { gte: cutoff } },
    }),
    prisma.portfolioPerformance.deleteMany({
      where: { userId, date: { gte: cutoff } },
    }),
  ]);
  deleteTtlCacheKeyPrefix('carteiraResumo', `${userId}:`);
}
