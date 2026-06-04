import { prisma } from '@/lib/prisma';
import { normalizeDateStart } from './patrimonioHistoricoBuilder';
import { deleteTtlCacheKeyPrefix } from '@/lib/simpleTtlCache';
import {
  replayPosition,
  isCorporateActionAuditTx,
  APPLICABLE_CORPORATE_ACTION_TYPES,
} from './corporateActions';

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
  portfolioId: string;
  recomputeSnapshotsFrom?: Date;
}): Promise<void> {
  const { targetUserId, assetId, portfolioId, recomputeSnapshotsFrom } = params;

  if (!assetId) {
    // Sem assetId não há como localizar as transações; nada a recalcular.
    return;
  }

  const txWhere: { userId: string; assetId: string } = {
    userId: targetUserId,
    assetId,
  };

  const allTransactions = await prisma.stockTransaction.findMany({
    where: txWhere,
    orderBy: { date: 'asc' },
  });

  // Linhas de auditoria de evento corporativo são informativas (visíveis no
  // histórico) mas NÃO entram no cálculo — o fator é aplicado via replay. Sem
  // separá-las, o ajuste seria contado em dobro (delta congelado + fator).
  const realTransactions = allTransactions.filter((tx) => !isCorporateActionAuditTx(tx.notes));

  if (realTransactions.length === 0) {
    if (assetId) {
      await prisma.fixedIncomeAsset.deleteMany({ where: { userId: targetUserId, assetId } });
      // Limpa eventuais linhas de auditoria órfãs antes de remover a posição.
      await prisma.stockTransaction.deleteMany({ where: { userId: targetUserId, assetId } });
    }
    await prisma.portfolio.delete({
      where: { id: portfolioId },
    });
    if (recomputeSnapshotsFrom) {
      await invalidatePortfolioSnapshots(targetUserId, recomputeSnapshotsFrom);
    }
    return;
  }

  // Eventos corporativos do ativo (por symbol). Renda-fixa/fundos não têm
  // registros nessa tabela, então o findMany volta vazio e o replay é no-op.
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { symbol: true },
  });
  const corporateActions = asset?.symbol
    ? await prisma.assetCorporateAction.findMany({
        where: {
          symbol: asset.symbol,
          type: { in: Array.from(APPLICABLE_CORPORATE_ACTION_TYPES) },
        },
        orderBy: { date: 'asc' },
        select: { date: true, type: true, factor: true },
      })
    : [];

  const { quantity: runningQty, cost: runningCost } = replayPosition(
    realTransactions,
    corporateActions,
  );

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
    // Bug #04: além de investedAmount, sincronizar startDate com a data da
    // primeira compra. Sem isso, editar a data inicial da movimentação não
    // propaga para a tela de detalhes (título e marcação na curva continuam
    // usando a data antiga). E regenerar Asset.name pra atualizar o template
    // "Renda Fixa - R$ X - data" quando a data muda.
    const firstBuy = realTransactions.find((tx) => tx.type === 'compra');
    if (firstBuy) {
      await prisma.fixedIncomeAsset.updateMany({
        where: { userId: targetUserId, assetId },
        data: { investedAmount: runningCost, startDate: firstBuy.date },
      });
      await syncFixedIncomeAssetNameDate(assetId, firstBuy.date, runningCost);
    } else {
      await prisma.fixedIncomeAsset.updateMany({
        where: { userId: targetUserId, assetId },
        data: { investedAmount: runningCost },
      });
    }
  }

  if (recomputeSnapshotsFrom) {
    await invalidatePortfolioSnapshots(targetUserId, recomputeSnapshotsFrom);
  }
}

/**
 * Bug #04: regenera o nome do Asset de renda fixa quando a primeira transação
 * é editada. O nome é um template estático ("Renda Fixa - R$ X - dd/mm/aaaa")
 * gerado em /api/carteira/operacao:1049; editar a data inicial deixava o
 * cabeçalho da tela de detalhes preso na data antiga.
 *
 * Estratégia conservadora: só atualiza o sufixo " - R$ X - data" — preserva
 * qualquer descrição customizada antes desse separador. Quando o nome não
 * casa com o template esperado (Asset foi renomeado manualmente), não toca.
 */
async function syncFixedIncomeAssetNameDate(
  assetId: string,
  newStartDate: Date,
  newInvestedAmount: number,
): Promise<void> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { name: true } });
  if (!asset?.name) return;

  // Usa UTC para formatação porque transactions.date é armazenado como UTC
  // midnight; toLocaleDateString sem timeZone shifta um dia pra trás em BRT.
  const dataFormatada = newStartDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  const valorFormatado = newInvestedAmount
    ? new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(newInvestedAmount)
    : '';

  // Regex casa o template fixo do gerador: "{prefixo} - R$ X - dd/mm/aaaa".
  // Captura prefixo até o primeiro " - R$" — preserva descrições editadas
  // pelo usuário ("CDB Reserva de Emergência - R$ 5.000 - 01/05/2019" → prefixo
  // "CDB Reserva de Emergência").
  const match = asset.name.match(/^(.*?) - R\$.*? - \d{2}\/\d{2}\/\d{4}\s*$/);
  if (!match) return; // Nome customizado fora do padrão: não mexer.

  const prefixo = match[1];
  const novoNome = `${prefixo}${valorFormatado ? ` - ${valorFormatado}` : ''} - ${dataFormatada}`;
  if (novoNome === asset.name) return;

  await prisma.asset.update({ where: { id: assetId }, data: { name: novoNome } });
}

/**
 * Apaga snapshots diários e performance TWR a partir do dia da edição.
 * Também invalida o cache TTL em memória do /carteira/resumo do usuário.
 * O loader detecta a quebra de cobertura (`coverageOk=false`) e cai no
 * builder ao vivo até o cron diário repopular o snapshot.
 */
export async function invalidatePortfolioSnapshots(userId: string, fromDate: Date): Promise<void> {
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
