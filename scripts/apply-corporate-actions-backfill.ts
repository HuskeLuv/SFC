/**
 * Backfill: aplica AssetCorporateAction (DESDOBRAMENTO/BONIFICACAO/GRUPAMENTO)
 * retroativamente ao Portfolio.quantity de todos os usuários que tinham
 * posição antes da ação corporativa.
 *
 * Antes deste backfill, o sistema persistia AssetCorporateAction (extraído
 * da BRAPI) mas nunca aplicava ao Portfolio do user. Quantidade ficava
 * estagnada no valor da compra original, distorcendo backtest e valor atual
 * da posição.
 *
 * Idempotente via marker `notes.corporateActionId` em StockTransaction.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/apply-corporate-actions-backfill.ts          # dry run (lista deltas)
 *   npx tsx --env-file=.env scripts/apply-corporate-actions-backfill.ts --apply  # persiste
 */
import prisma from '@/lib/prisma';
import { applyCorporateActionsToUserPositions } from '@/services/portfolio/applyCorporateActions';

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`🔧 Backfill corporate actions (${apply ? 'APPLY' : 'DRY RUN'})\n`);

  if (!apply) {
    // Dry run: mostra deltas esperados sem persistir.
    const rows = await prisma.$queryRaw<
      Array<{
        email: string;
        symbol: string;
        qty: number;
        action_type: string;
        factor: number;
        action_date: Date;
      }>
    >`
      WITH first_buys AS (
        SELECT
          st."userId",
          a.symbol,
          a.id AS asset_id,
          MIN(st.date) AS first_buy
        FROM stock_transactions st
        JOIN assets a ON a.id = st."assetId"
        WHERE st.type = 'compra' AND a.type IN ('stock', 'fii', 'bdr')
        GROUP BY st."userId", a.symbol, a.id
      )
      SELECT
        u.email,
        fb.symbol,
        p.quantity AS qty,
        ca.type AS action_type,
        ca.factor,
        ca.date AS action_date
      FROM first_buys fb
      JOIN "User" u ON u.id = fb."userId"
      JOIN portfolios p ON p."userId" = fb."userId" AND p."assetId" = fb.asset_id
      JOIN asset_corporate_actions ca
        ON ca.symbol = fb.symbol AND ca.date >= fb.first_buy
      WHERE ca.type IN ('DESDOBRAMENTO', 'BONIFICACAO', 'GRUPAMENTO')
        AND NOT EXISTS (
          SELECT 1 FROM stock_transactions stx
          WHERE stx."userId" = fb."userId"
            AND stx."assetId" = fb.asset_id
            AND stx.notes LIKE '%"corporateActionId":"' || ca.id || '"%'
        )
      ORDER BY u.email, fb.symbol, ca.date
    `;
    console.log(`${rows.length} ações corporativas pendentes:\n`);
    for (const r of rows) {
      const newQty = r.qty * r.factor;
      console.log(
        `  [${r.email.slice(0, 30)}] ${r.symbol} ${r.action_type} factor=${r.factor} em ${r.action_date.toISOString().slice(0, 10)}: ${r.qty} → ${newQty.toFixed(4)}`,
      );
    }
    if (rows.length > 0) console.log('\n💡 Rode com --apply para persistir.');
    return;
  }

  // Lista todos os users com posições stock/fii/bdr
  const users = await prisma.user.findMany({
    where: { portfolios: { some: { asset: { type: { in: ['stock', 'fii', 'bdr'] } } } } },
    select: { id: true, email: true },
  });
  console.log(`${users.length} usuários a processar\n`);

  let totalScanned = 0;
  let totalApplied = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const u of users) {
    const r = await applyCorporateActionsToUserPositions(u.id);
    if (r.applied > 0 || r.errors > 0) {
      console.log(
        `  [${u.email}] scanned=${r.scanned} applied=${r.applied} skipped=${r.skipped} errors=${r.errors}`,
      );
    }
    totalScanned += r.scanned;
    totalApplied += r.applied;
    totalSkipped += r.skipped;
    totalErrors += r.errors;
  }

  console.log(
    `\n✅ Total: scanned=${totalScanned} applied=${totalApplied} skipped=${totalSkipped} errors=${totalErrors}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Erro:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
