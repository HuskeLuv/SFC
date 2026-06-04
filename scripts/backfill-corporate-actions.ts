/**
 * Backfill de eventos corporativos: reaplica splits/grupamentos/bonificações a
 * TODAS as posições de RV (stock/fii/bdr) usando a nova regra ciente de fator,
 * e recalcula os proventos com a quantidade pós-evento.
 *
 *   npx tsx --env-file=.env scripts/backfill-corporate-actions.ts            # dry-run (relatório)
 *   npx tsx --env-file=.env scripts/backfill-corporate-actions.ts --apply    # persiste
 *
 * Idempotente:
 *   - applyCorporateActionsToUserPositions só cria a linha de auditoria que
 *     faltar e recomputa o Portfolio (recalc é a fonte da verdade do avgPrice).
 *   - ensurePortfolioProventosFromMarket (sync) refresca proventos BRAPI e
 *     respeita edições manuais/dismiss do usuário.
 */
import prisma from '@/lib/prisma';
import { applyCorporateActionsToUserPositions } from '@/services/portfolio/applyCorporateActions';
import { ensurePortfolioProventosFromMarket } from '@/lib/ensurePortfolioProventosFromMarket';
import { CORPORATE_ACTION_NOTE_MARKER } from '@/services/portfolio/corporateActions';

const RV_TYPES = ['stock', 'fii', 'bdr'];

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`\n🏦 Backfill de eventos corporativos (${apply ? 'APPLY' : 'DRY RUN'})\n`);

  const portfoliosBefore = await prisma.portfolio.findMany({
    where: { asset: { type: { in: RV_TYPES } } },
    include: { asset: { select: { symbol: true } } },
    orderBy: { id: 'asc' },
  });
  console.log(`Posições de RV: ${portfoliosBefore.length}`);
  const before = new Map(portfoliosBefore.map((p) => [p.id, { qty: p.quantity, avg: p.avgPrice }]));

  if (!apply) {
    console.log('\n⚠️  Dry-run — rode com --apply para persistir.');
    return;
  }

  // 1) Aplica eventos (audit rows + recalc) por usuário.
  const users = await prisma.portfolio.findMany({
    where: { asset: { type: { in: RV_TYPES } } },
    select: { userId: true },
    distinct: ['userId'],
  });
  let scanned = 0;
  let applied = 0;
  for (const { userId } of users) {
    const r = await applyCorporateActionsToUserPositions(userId);
    scanned += r.scanned;
    applied += r.applied;
  }
  console.log(`\nEventos: ${scanned} avaliados, ${applied} novas linhas de auditoria.`);

  // 2) Recalcula proventos (quantidade pós-evento) por posição.
  let proventosTouched = 0;
  for (const p of portfoliosBefore) {
    if (!p.assetId || !p.asset?.symbol) continue;
    const txs = await prisma.stockTransaction.findMany({
      where: {
        userId: p.userId,
        assetId: p.assetId,
        type: { in: ['compra', 'venda'] },
        NOT: { notes: { contains: CORPORATE_ACTION_NOTE_MARKER } },
      },
      select: { date: true, quantity: true, type: true },
    });
    const fresh = await prisma.portfolio.findUnique({
      where: { id: p.id },
      select: { quantity: true, lastUpdate: true },
    });
    const countBefore = await prisma.portfolioProvento.count({
      where: { portfolioId: p.id, userId: p.userId },
    });
    await ensurePortfolioProventosFromMarket({
      portfolioId: p.id,
      userId: p.userId,
      ticker: p.asset.symbol,
      transactions: txs,
      portfolioQuantity: fresh?.quantity ?? p.quantity,
      portfolioLastUpdate: fresh?.lastUpdate ?? p.lastUpdate,
      mode: 'sync',
    });
    const countAfter = await prisma.portfolioProvento.count({
      where: { portfolioId: p.id, userId: p.userId },
    });
    if (countAfter !== countBefore) proventosTouched += countAfter - countBefore;
  }
  console.log(`Proventos: ${proventosTouched} criados/ajustados (refresh sync).`);

  // 3) Relatório de mudanças de preço médio.
  const after = await prisma.portfolio.findMany({
    where: { id: { in: portfoliosBefore.map((p) => p.id) } },
    include: { asset: { select: { symbol: true } } },
    orderBy: { id: 'asc' },
  });
  let changed = 0;
  console.log('\nMudanças de preço médio / quantidade:');
  for (const p of after) {
    const b = before.get(p.id);
    if (!b) continue;
    const qtyChanged = Math.abs(b.qty - p.quantity) > 1e-6;
    const avgChanged = Math.abs(b.avg - p.avgPrice) > 1e-6;
    if (qtyChanged || avgChanged) {
      changed++;
      console.log(
        `  ${(p.asset?.symbol ?? p.id).padEnd(10)} qty ${b.qty} → ${p.quantity} | avg ${b.avg.toFixed(4)} → ${p.avgPrice.toFixed(4)}`,
      );
    }
  }
  console.log(`\n✅ ${changed} posição(ões) ajustada(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
  });
