/**
 * Bug #04 (relatório Maio/2026, 2º passe): assets de renda fixa criados ANTES
 * do deploy da fix da Sprint 3 (2026-05-11) ou editados via endpoint que não
 * dispara `recalculatePortfolioFromTransactions` ficaram com
 * `FixedIncomeAsset.startDate` e `Asset.name` dessincronizados em relação à
 * `StockTransaction.date` da primeira compra.
 *
 * Caso confirmado: CDB Reserva EM do testekinvo@hotmail.com tinha
 * `transaction.date = 2022-05-02` (correto, após edição), mas
 * `FI.startDate = 2019-05-01` e `Asset.name = "...01/05/2019"` (legados).
 *
 * Estratégia: para cada portfolio de RF, busca a primeira transação compra,
 * compara com FI.startDate, e se divergir > 1 dia chama o recalc — que já
 * sincroniza startDate + investedAmount + regenera Asset.name pelo template
 * "{prefixo} - R$ X - dd/mm/aaaa". Idempotente.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/backfill-rf-startdate-sync.ts          # dry run
 *   npx tsx --env-file=.env scripts/backfill-rf-startdate-sync.ts --apply  # persiste
 */
import prisma from '@/lib/prisma';
import { recalculatePortfolioFromTransactions } from '@/services/portfolio/portfolioRecalculation';

const RF_TYPES = ['bond', 'emergency', 'opportunity', 'personalizado', 'tesouro-direto'];
const DAY_MS = 24 * 60 * 60 * 1000;

interface Divergence {
  userId: string;
  userEmail: string;
  portfolioId: string;
  assetId: string;
  symbol: string;
  name: string;
  fiStartDate: string;
  txDate: string;
  daysDiff: number;
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`🔧 Backfill startDate/name RF (${apply ? 'APPLY' : 'DRY RUN'})\n`);

  const portfolios = await prisma.portfolio.findMany({
    where: { asset: { type: { in: RF_TYPES } } },
    include: {
      asset: { include: { fixedIncomeAsset: true } },
      user: { select: { email: true } },
    },
  });
  console.log(`Lendo ${portfolios.length} portfolios RF/reserva\n`);

  const divergences: Divergence[] = [];

  for (const p of portfolios) {
    const fi = p.asset?.fixedIncomeAsset;
    if (!fi?.startDate || !p.assetId) continue;

    const firstBuy = await prisma.stockTransaction.findFirst({
      where: { userId: p.userId, assetId: p.assetId, type: 'compra' },
      orderBy: { date: 'asc' },
      select: { date: true },
    });

    if (!firstBuy) continue;

    const fiStart = fi.startDate.getTime();
    const txDate = firstBuy.date.getTime();
    const daysDiff = Math.round(Math.abs(fiStart - txDate) / DAY_MS);

    if (daysDiff > 1) {
      divergences.push({
        userId: p.userId,
        userEmail: p.user?.email ?? '?',
        portfolioId: p.id,
        assetId: p.assetId,
        symbol: p.asset?.symbol ?? '',
        name: p.asset?.name ?? '',
        fiStartDate: fi.startDate.toISOString().slice(0, 10),
        txDate: firstBuy.date.toISOString().slice(0, 10),
        daysDiff,
      });
    }
  }

  console.log(`📊 ${divergences.length} portfolios com divergência > 1 dia:\n`);
  if (divergences.length === 0) return;

  console.table(
    divergences.map((d) => ({
      user: d.userEmail.slice(0, 30),
      symbol: d.symbol.slice(0, 25),
      fi_startDate: d.fiStartDate,
      tx_date: d.txDate,
      days: d.daysDiff,
    })),
  );

  if (!apply) {
    console.log('\n💡 Rode com --apply para sincronizar via recalculatePortfolioFromTransactions.');
    return;
  }

  let synced = 0;
  let errors = 0;

  for (const d of divergences) {
    try {
      await recalculatePortfolioFromTransactions({
        targetUserId: d.userId,
        assetId: d.assetId,
        portfolioId: d.portfolioId,
      });
      synced++;
    } catch (err) {
      console.warn(`  ⚠️  ${d.symbol}:`, err);
      errors++;
    }
  }

  console.log(`\n✅ ${synced} sincronizados, ${errors} erros.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Erro:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
