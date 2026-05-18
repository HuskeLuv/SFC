/**
 * One-off backfill: re-derive quantity/avgPrice for Portfolio entries whose
 * catalog Tesouro Direto was saved under the old "por valor investido" logic.
 *
 * Context: src/app/api/carteira/operacao/route.ts used to persist such saves
 * with quantity=1 and avgPrice=valorInvestido, which made valor atualizado =
 * valorInvestido × asset.currentPrice (i.e., grossly inflated after any market
 * move). The route now looks up TesouroDiretoPrice.sellPU on the purchase
 * date and stores quantity = valorInvestido / sellPU. This script applies the
 * same derivation to legacy rows.
 *
 * Detection heuristic: a compra transaction with quantity=1 AND price≈total
 * signals the old fallback. Rows where the user explicitly bought 1 título
 * via "cotas" method will match too, but the recomputed values will equal
 * what they already were (modulo rounding), so the update is idempotent.
 *
 * Run with:  npx tsx scripts/backfill-tesouro-valor-investido.ts
 * Flags:
 *   --dry-run           Preview sem persistir alterações
 *   --verbose           Log antes/depois de cada tx atualizada
 *   --user-id=<cuid>    Processa apenas o userId informado
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

function parseArg(flag: string): string | null {
  const entry = process.argv.find((a) => a.startsWith(`${flag}=`));
  return entry ? entry.slice(flag.length + 1) : null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const verbose = process.argv.includes('--verbose');
  const userIdFilter = parseArg('--user-id');

  const portfolios = await prisma.portfolio.findMany({
    where: {
      asset: { type: 'tesouro-direto' },
      ...(userIdFilter ? { userId: userIdFilter } : {}),
    },
    include: { asset: { select: { id: true, name: true, symbol: true } } },
  });

  console.log(
    `Found ${portfolios.length} catalog Tesouro portfolio(s)${userIdFilter ? ` for user ${userIdFilter}` : ''}.`,
  );

  let updated = 0;
  let skippedUnparseable = 0;
  let skippedNoValorSaves = 0;
  let skippedMissingPU = 0;
  let txMissingPU = 0;

  for (const portfolio of portfolios) {
    if (!portfolio.asset || !portfolio.assetId) continue;
    const name = portfolio.asset.name ?? '';
    const nameMatch = name.match(/^(.+)\s(\d{4})$/);
    if (!nameMatch) {
      console.log(`  ⚠️  portfolio ${portfolio.id}  unparseable name: "${name}"`);
      skippedUnparseable++;
      continue;
    }
    const bondType = nameMatch[1].trim();
    const maturityYear = parseInt(nameMatch[2], 10);

    const transactions = await prisma.stockTransaction.findMany({
      where: {
        userId: portfolio.userId,
        assetId: portfolio.assetId,
        type: 'compra',
      },
      orderBy: { date: 'asc' },
    });

    const valorSaves = transactions.filter(
      (tx) => Number(tx.quantity) === 1 && near(Number(tx.price), Number(tx.total)),
    );
    if (valorSaves.length === 0) {
      skippedNoValorSaves++;
      continue;
    }

    const txUpdates: Array<{ id: string; quantity: number; price: number }> = [];
    let totalQuantity = 0;
    let totalInvested = 0;
    let hadMissingPU = false;

    for (const tx of transactions) {
      const total = Number(tx.total);
      const isValorSave = Number(tx.quantity) === 1 && near(Number(tx.price), total);

      if (isValorSave) {
        const priceRow = await prisma.tesouroDiretoPrice.findFirst({
          where: {
            bondType,
            maturityDate: {
              gte: new Date(`${maturityYear}-01-01`),
              lt: new Date(`${maturityYear + 1}-01-01`),
            },
            baseDate: { lte: tx.date },
          },
          orderBy: { baseDate: 'desc' },
          select: { sellPU: true, baseDate: true },
        });
        const sellPU = priceRow?.sellPU ? Number(priceRow.sellPU) : 0;
        if (sellPU > 0) {
          const newQuantity = total / sellPU;
          txUpdates.push({ id: tx.id, quantity: newQuantity, price: sellPU });
          totalQuantity += newQuantity;
          totalInvested += total;
          if (verbose) {
            console.log(
              `     tx ${tx.id} ${tx.date.toISOString().slice(0, 10)}  qty 1 → ${newQuantity.toFixed(6)}  price ${total.toFixed(2)} → ${sellPU.toFixed(2)} (PU base ${priceRow!.baseDate.toISOString().slice(0, 10)})`,
            );
          }
        } else {
          console.log(
            `  ⚠️  tx ${tx.id}  no TesouroDiretoPrice for "${bondType} ${maturityYear}" on/before ${tx.date.toISOString().slice(0, 10)}`,
          );
          txMissingPU++;
          hadMissingPU = true;
          totalQuantity += Number(tx.quantity);
          totalInvested += total;
        }
      } else {
        totalQuantity += Number(tx.quantity);
        totalInvested += total;
      }
    }

    // Abortar se alguma valor-save ficou sem PU: atualizar parcialmente geraria
    // Portfolio.quantity inconsistente com a soma real das transações.
    if (hadMissingPU) {
      console.log(
        `  ⏭️  portfolio ${portfolio.id} (${name}) pulado — faltou PU para ao menos uma tx; rode o sync de TesouroDiretoPrice e tente novamente`,
      );
      skippedMissingPU++;
      continue;
    }

    if (txUpdates.length === 0) {
      skippedNoValorSaves++;
      continue;
    }

    const avgPrice = totalQuantity > 0 ? totalInvested / totalQuantity : 0;

    console.log(
      `  ✓  portfolio ${portfolio.id} (${name})  ${txUpdates.length} tx(s) → qty=${totalQuantity.toFixed(6)} avgPrice=${avgPrice.toFixed(2)}`,
    );

    if (!dryRun) {
      await prisma.$transaction([
        ...txUpdates.map((u) =>
          prisma.stockTransaction.update({
            where: { id: u.id },
            data: { quantity: u.quantity, price: u.price },
          }),
        ),
        prisma.portfolio.update({
          where: { id: portfolio.id },
          data: {
            quantity: totalQuantity,
            avgPrice,
            totalInvested,
            lastUpdate: new Date(),
          },
        }),
      ]);
    }

    updated++;
  }

  console.log(
    `\nUpdated ${updated} | skipped ${skippedUnparseable} (unparseable) + ${skippedNoValorSaves} (no valor saves) + ${skippedMissingPU} (PU ausente) | ${txMissingPU} tx(s) sem PU disponível`,
  );
  if (dryRun) console.log('(dry-run — nenhuma alteração persistida)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
