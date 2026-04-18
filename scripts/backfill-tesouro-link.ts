/**
 * One-off backfill: link legacy FixedIncomeAsset rows for catalog Tesouro
 * Direto to TesouroDiretoPrice by populating `tesouroBondType` and
 * `tesouroMaturity`.
 *
 * Context: src/app/api/carteira/operacao/route.ts used to create
 * FixedIncomeAsset rows for Tesouro picked from the catalog without
 * setting these two fields. As a result, bridgeTesouroToAssetPrices
 * (services/pricing/tesouroDiretoSync.ts) silently found zero records
 * and never refreshed Asset.currentPrice from the official sellPU.
 *
 * Strategy: parse the catalog Asset.name (format "{bondType} {YYYY}",
 * see syncTesouroAssetCatalog) and look up the exact maturityDate in
 * TesouroDiretoPrice — same logic the operacao route now runs at
 * insert time.
 *
 * Run with:  npx tsx scripts/backfill-tesouro-link.ts
 * Add --dry-run to preview without writing.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const candidates = await prisma.fixedIncomeAsset.findMany({
    where: {
      tesouroBondType: null,
      asset: { type: 'tesouro-direto' },
    },
    include: { asset: { select: { id: true, name: true, symbol: true } } },
  });

  console.log(`Found ${candidates.length} FixedIncomeAsset row(s) without tesouro link.`);

  if (candidates.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let resolved = 0;
  let skippedNoMatch = 0;
  let skippedNoPrice = 0;
  const updates: Array<{
    id: string;
    bondType: string;
    maturityDate: Date;
  }> = [];

  for (const fi of candidates) {
    const name = fi.asset?.name ?? '';
    const nameMatch = name.match(/^(.+)\s(\d{4})$/);
    if (!nameMatch) {
      console.log(`  ⚠️  ${fi.id}  unparseable name: "${name}"`);
      skippedNoMatch++;
      continue;
    }
    const bondType = nameMatch[1];
    const maturityYear = parseInt(nameMatch[2], 10);

    const exactPrice = await prisma.tesouroDiretoPrice.findFirst({
      where: {
        bondType,
        maturityDate: {
          gte: new Date(`${maturityYear}-01-01`),
          lt: new Date(`${maturityYear + 1}-01-01`),
        },
      },
      orderBy: { baseDate: 'desc' },
      select: { maturityDate: true },
    });

    if (!exactPrice) {
      console.log(`  ⚠️  ${fi.id}  no TesouroDiretoPrice for "${bondType} ${maturityYear}"`);
      skippedNoPrice++;
      continue;
    }

    updates.push({
      id: fi.id,
      bondType,
      maturityDate: exactPrice.maturityDate,
    });
    resolved++;
  }

  console.log(
    `\nResolved ${resolved} | skipped ${skippedNoMatch} (unparseable) + ${skippedNoPrice} (no price match)`,
  );

  if (dryRun) {
    console.log('\nDry run — no changes written. Sample of resolved updates:');
    updates
      .slice(0, 10)
      .forEach((u) =>
        console.log(`  - ${u.id}  ${u.bondType}  ${u.maturityDate.toISOString().slice(0, 10)}`),
      );
    return;
  }

  for (const u of updates) {
    await prisma.fixedIncomeAsset.update({
      where: { id: u.id },
      data: {
        tesouroBondType: u.bondType,
        tesouroMaturity: u.maturityDate,
      },
    });
  }

  console.log(`\nUpdated ${updates.length} FixedIncomeAsset row(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
