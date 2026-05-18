/**
 * Targeted backfill — only syncs prices for assets users actually hold,
 * then rebuilds portfolio snapshots.
 *
 * Run with: npx tsx scripts/backfill-targeted.ts
 *
 * Step 1 (already done by previous run): Tesouro Direto ✓
 * Step 2 (already done by previous run): Crypto + currency prices ✓
 * Step 3: Stock prices — ONLY for assets in user portfolios
 * Step 4: CVM Fund Sync
 * Step 5: Portfolio snapshots — full rebuild
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function backfill() {
  const startTime = Date.now();
  console.log('=== TARGETED BACKFILL ===');
  console.log(`Date: ${new Date().toISOString()}\n`);

  // Step 3: Stock prices — only portfolio-held assets
  console.log('─── 1/3: Stock prices (portfolio-held only) ───');
  try {
    const { fetchDetailedQuotes } = await import('../src/services/pricing/brapiQuote');

    // Get assets that users actually hold
    const heldAssets = await prisma.asset.findMany({
      where: {
        portfolios: { some: {} },
        type: {
          notIn: ['crypto', 'currency', 'emergency', 'opportunity', 'personalizado', 'imovel'],
        },
        source: { not: 'manual' },
        symbol: { not: { startsWith: 'RESERVA-' } },
      },
      select: { id: true, symbol: true, type: true, currency: true },
    });

    // Filter to valid symbols
    const validAssets = heldAssets.filter(
      (a) =>
        !a.symbol.startsWith('RENDA-FIXA') &&
        !a.symbol.startsWith('CONTA-CORRENTE') &&
        !a.symbol.startsWith('-') &&
        /^[A-Za-z]/.test(a.symbol),
    );

    console.log(
      `   ${validAssets.length} portfolio-held assets to sync (vs ${27421} total in catalog)`,
    );

    const assetBySymbol = new Map(validAssets.map((a) => [a.symbol.toUpperCase(), a]));
    const BATCH_SIZE = 20;
    const BATCH_DELAY = 400;
    let totalInserted = 0;
    let totalUpdated = 0;
    let errors = 0;

    const symbols = validAssets.map((a) => a.symbol.trim().toUpperCase());

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      try {
        const results = await fetchDetailedQuotes(batch);

        for (const r of results) {
          if (!r.symbol || r.regularMarketPrice == null || r.regularMarketPrice <= 0) continue;
          const symbolUpper = r.symbol.toUpperCase();
          const asset = assetBySymbol.get(symbolUpper);
          if (!asset) continue;

          const marketDate = r.regularMarketTime ? new Date(r.regularMarketTime) : new Date();
          const validDate = Number.isNaN(marketDate.getTime()) ? new Date() : marketDate;
          const dayDate = new Date(
            validDate.getFullYear(),
            validDate.getMonth(),
            validDate.getDate(),
          );

          try {
            const existing = await prisma.assetPriceHistory.findUnique({
              where: { symbol_date: { symbol: symbolUpper, date: dayDate } },
            });

            await prisma.$transaction([
              prisma.assetPriceHistory.upsert({
                where: { symbol_date: { symbol: symbolUpper, date: dayDate } },
                update: { price: new Decimal(r.regularMarketPrice) },
                create: {
                  assetId: asset.id,
                  symbol: symbolUpper,
                  price: new Decimal(r.regularMarketPrice),
                  currency: r.currency || asset.currency || null,
                  source: 'BRAPI',
                  date: dayDate,
                },
              }),
              prisma.asset.update({
                where: { id: asset.id },
                data: {
                  currentPrice: new Decimal(r.regularMarketPrice),
                  priceUpdatedAt: validDate,
                },
              }),
            ]);

            if (existing) totalUpdated++;
            else totalInserted++;
          } catch {
            errors++;
          }
        }

        if (i + BATCH_SIZE < symbols.length) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
        }

        // Progress log every 5 batches
        if ((i / BATCH_SIZE + 1) % 5 === 0) {
          console.log(
            `   Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(symbols.length / BATCH_SIZE)} done`,
          );
        }
      } catch (batchErr) {
        console.error(
          `   Batch error at ${i}:`,
          batchErr instanceof Error ? batchErr.message : batchErr,
        );
        errors += batch.length;
      }
    }

    console.log(`   OK: ${totalInserted} inserted, ${totalUpdated} updated, ${errors} errors`);

    // Write sync log
    await prisma.syncPriceLog.create({
      data: {
        totalInserted,
        totalUpdated,
        errors,
        duration: Math.round((Date.now() - startTime) / 1000),
      },
    });
  } catch (e) {
    console.error('   FAILED:', e instanceof Error ? e.message : e);
  }
  console.log('');

  // Step 4: CVM Fund Sync
  console.log('─── 2/3: CVM Fund Sync ───');
  try {
    const { runCvmFundSync } = await import('../src/services/pricing/cvmFundSync');
    const result = await runCvmFundSync();
    console.log(
      `   OK: ${result.inserted} inserted, ${result.updated} updated, funds: ${result.fundsProcessed}`,
    );
  } catch (e) {
    console.error('   FAILED:', e instanceof Error ? e.message : e);
  }
  console.log('');

  // Step 5: Portfolio snapshots — full rebuild
  console.log('─── 3/3: Portfolio Snapshots (full rebuild) ───');
  try {
    const { normalizeDateStart, buildPatrimonioHistorico } =
      await import('../src/services/portfolio/patrimonioHistoricoBuilder');
    const { loadCarteiraHistoricoData } =
      await import('../src/services/portfolio/carteiraHistoricoDataLoader');

    const users = await prisma.user.findMany({
      where: {
        OR: [{ portfolios: { some: {} } }, { stockTransactions: { some: {} } }],
      },
      select: { id: true },
    });

    console.log(`   ${users.length} users to process`);

    const batchSize = 50;
    const yesterday = normalizeDateStart(new Date());
    yesterday.setDate(yesterday.getDate() - 1);

    let totalSnapshots = 0;
    let totalPerf = 0;
    let userErrors = 0;

    for (const user of users) {
      try {
        const data = await loadCarteiraHistoricoData(user.id);
        const { historicoPatrimonio, historicoTWR } = await buildPatrimonioHistorico({
          ...data,
          saldoBrutoAtual: 0,
          valorAplicadoAtual: 0,
          maxHistoricoMonths: null,
          patchLastDayWithLiveTotals: false,
          timelineEndDate: yesterday,
        });

        if (historicoPatrimonio.length === 0) continue;

        const toDayDate = (ts: number): Date => normalizeDateStart(new Date(ts));

        for (let i = 0; i < historicoPatrimonio.length; i += batchSize) {
          const slice = historicoPatrimonio.slice(i, i + batchSize);
          await prisma.$transaction(
            slice.map((row) => {
              const day = toDayDate(row.data);
              return prisma.portfolioDailySnapshot.upsert({
                where: { userId_date: { userId: user.id, date: day } },
                create: {
                  userId: user.id,
                  date: day,
                  totalValue: row.saldoBruto,
                  totalInvested: row.valorAplicado,
                  totalEarnings: 0,
                },
                update: {
                  totalValue: row.saldoBruto,
                  totalInvested: row.valorAplicado,
                  totalEarnings: 0,
                },
              });
            }),
          );
          totalSnapshots += slice.length;
        }

        for (let i = 0; i < historicoTWR.length; i += batchSize) {
          const slice = historicoTWR.slice(i, i + batchSize);
          await prisma.$transaction(
            slice.map((row, j) => {
              const idx = i + j;
              const prevTwr = idx > 0 ? historicoTWR[idx - 1] : null;
              let dailyReturn: number | null = null;
              if (prevTwr) {
                const fPrev = 1 + (prevTwr.value ?? 0) / 100;
                const fCur = 1 + (row.value ?? 0) / 100;
                if (fPrev > 0) dailyReturn = fCur / fPrev - 1;
              }
              const day = toDayDate(row.data);
              return prisma.portfolioPerformance.upsert({
                where: { userId_date: { userId: user.id, date: day } },
                create: { userId: user.id, date: day, dailyReturn, cumulativeReturn: row.value },
                update: { dailyReturn, cumulativeReturn: row.value },
              });
            }),
          );
          totalPerf += slice.length;
        }

        console.log(
          `   User ${user.id}: ${historicoPatrimonio.length} snapshots, ${historicoTWR.length} perfs`,
        );
      } catch (e) {
        userErrors++;
        console.error(`   User ${user.id} FAILED:`, e instanceof Error ? e.message : e);
      }
    }

    console.log(
      `   TOTAL: ${totalSnapshots} snapshots, ${totalPerf} performances, ${userErrors} errors`,
    );
  } catch (e) {
    console.error('   FAILED:', e instanceof Error ? e.message : e);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== BACKFILL COMPLETE (${duration}s) ===`);
  await prisma.$disconnect();
}

backfill().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
