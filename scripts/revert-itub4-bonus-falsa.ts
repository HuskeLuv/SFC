/**
 * F1.1 (Relatório Definitivo Mai/27): reverter bonificação ITUB4 falsa.
 *
 * A BRAPI tinha registrado 2 bonificações ITUB4 em 2025:
 *   - 2025-03-17 factor=1.1  (FALSA — não consta no Kinvo)
 *   - 2025-12-23 factor=1.03 (REAL — Kinvo confirma)
 *
 * O backfill da Sprint 7 (commit 5164dad) aplicou as 2 em cascata:
 *   500 → 550 (×1.1) → 566.5 (×1.03)
 *
 * Kinvo (fonte de verdade) mostra 515 ações (500 × 1.03), PM R$27,05.
 *
 * Este script:
 *   1. Deleta AssetCorporateAction ITUB4 BONIFICACAO 2025-03-17 factor=1.1
 *   2. Deleta todas as StockTransactions de ajuste-corporativo de ITUB4 do user
 *   3. Recalcula Portfolio (volta a qty original da compra)
 *   4. Re-roda applyCorporateActionsToUserPositions (aplica só a 1.03 válida)
 *
 * Aplicado em prod uma vez em 2026-05-27. Idempotente — se a action falsa já
 * foi removida, o passo 1 é no-op.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/revert-itub4-bonus-falsa.ts
 */
import prisma from '@/lib/prisma';
import { recalculatePortfolioFromTransactions } from '@/services/portfolio/portfolioRecalculation';
import { applyCorporateActionsToUserPositions } from '@/services/portfolio/applyCorporateActions';

async function main() {
  const userId = '5ff9c55f-fa4f-4a3d-8821-b77c2c5faa02'; // pedrotestemaio@hotmail.com

  // 1. Deletar action falsa
  const fake = await prisma.assetCorporateAction.deleteMany({
    where: {
      symbol: 'ITUB4',
      type: 'BONIFICACAO',
      factor: 1.1,
      date: { gte: new Date('2025-03-01'), lt: new Date('2025-04-01') },
    },
  });
  console.log(`AssetCorporateAction removidas: ${fake.count}`);

  // 2. Localizar asset/portfolio do user
  const itub4 = await prisma.asset.findFirst({ where: { symbol: 'ITUB4' } });
  if (!itub4) {
    console.log('Asset ITUB4 não encontrado');
    return;
  }
  const portfolio = await prisma.portfolio.findFirst({
    where: { userId, assetId: itub4.id },
  });
  if (!portfolio) {
    console.log('Portfolio ITUB4 do user não encontrado');
    return;
  }

  // 3. Deletar todas as tx de ajuste-corporativo de ITUB4 do user
  const adjusts = await prisma.stockTransaction.deleteMany({
    where: {
      userId,
      assetId: itub4.id,
      notes: { contains: '"ajuste-corporativo"' },
    },
  });
  console.log(`StockTransactions de ajuste removidas: ${adjusts.count}`);

  // 4. Recalc portfolio (volta a qty original da compra)
  await recalculatePortfolioFromTransactions({
    targetUserId: userId,
    assetId: itub4.id,
    portfolioId: portfolio.id,
  });

  // 5. Reaplicar só corp actions VÁLIDAS (a 1.03 sobrou)
  const result = await applyCorporateActionsToUserPositions(userId);
  console.log(`applyCorporateActions: ${JSON.stringify(result)}`);

  // 6. Conferir
  const after = await prisma.portfolio.findUnique({ where: { id: portfolio.id } });
  console.log(`\nResultado: qty=${after?.quantity} avgPrice=R$${after?.avgPrice.toFixed(2)}`);
  if (after && Math.abs(after.quantity - 515) < 0.01) {
    console.log('✅ Bate com Kinvo (515 ações)');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Erro:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
