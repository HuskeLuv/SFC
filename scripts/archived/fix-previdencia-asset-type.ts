/**
 * One-off migration: relabel previdência assets stored with the legacy
 * `type: 'insurance'` discriminator to `type: 'previdencia'`, so they show
 * up in the /api/carteira/previdencia-seguros table.
 *
 * Context: src/app/api/carteira/operacao/route.ts used to create manual
 * previdência assets with `type: 'insurance'`, but the GET filter expects
 * `type: 'previdencia'`. Assets created before the fix are invisible until
 * this script runs.
 *
 * Scope: only rows created by the manual-previdência branch (source = 'manual',
 * symbol prefixed with `PREVIDENCIA-`) are touched, so legitimate life-insurance
 * assets (if any exist outside that branch) are left alone.
 *
 * Run with: npx tsx scripts/fix-previdencia-asset-type.ts
 * Add `--dry-run` to preview without writing.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const candidates = await prisma.asset.findMany({
    where: {
      type: 'insurance',
      source: 'manual',
      symbol: { startsWith: 'PREVIDENCIA-' },
    },
    select: { id: true, symbol: true, name: true },
  });

  console.log(`Found ${candidates.length} asset(s) to migrate.`);
  candidates.forEach((a) => console.log(`  - ${a.id}  ${a.symbol}  ${a.name}`));

  if (dryRun) {
    console.log('Dry run — no changes written.');
    return;
  }

  if (candidates.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const result = await prisma.asset.updateMany({
    where: {
      id: { in: candidates.map((c) => c.id) },
    },
    data: { type: 'previdencia' },
  });

  console.log(`Updated ${result.count} asset(s) to type='previdencia'.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
