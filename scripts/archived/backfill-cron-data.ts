/**
 * Backfill script to recover data lost during the cron outage.
 *
 * Run with: npx tsx scripts/backfill-cron-data.ts
 *
 * What it does:
 * 1. EconomicIndex (BACEN): 5-year backfill of CDI, IPCA, SELIC, IMAB, etc.
 * 2. IBOV daily history: 1-year window via BRAPI quote/^BVSP
 * 3. Tesouro Direto: re-syncs with 30-day lookback
 * 4. BRAPI prices: syncs current prices for all asset types
 * 5. CVM Fund Sync: runs the daily sync
 * 6. Portfolio Snapshots: rebuilds full history for all users (covers missing days)
 *
 * Safe to run multiple times — all operations use upsert.
 */

import { PrismaClient } from '@prisma/client';

// We need to set up the prisma singleton before importing services
const prisma = new PrismaClient();

async function backfill() {
  const startTime = Date.now();
  console.log('=== BACKFILL START ===');
  console.log(`Date: ${new Date().toISOString()}\n`);

  // 1. EconomicIndex — 5-year BACEN backfill
  console.log('─── 1/6: EconomicIndex (BACEN, 5-year backfill) ───');
  try {
    const { runEconomicIndexesIngestion } =
      await import('../src/services/market/economicIndexesIngestion');
    const result = await runEconomicIndexesIngestion(undefined, undefined, true);
    console.log(
      `   OK: ${result.totalInserted} inserted, ${result.totalUpdated} updated across ${Object.keys(result.details).length} séries`,
    );
  } catch (e) {
    console.error('   FAILED:', e instanceof Error ? e.message : e);
  }
  console.log('');

  // 2. IBOV history — feeds the rentabilidade chart benchmark line
  console.log('─── 2/6: IBOV daily history (1-year window) ───');
  try {
    const { getAssetHistory } = await import('../src/services/pricing/assetPriceService');
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    const series = await getAssetHistory('^BVSP', start, end, { useBrapiFallback: true });
    console.log(`   OK: ${series.length} data points fetched/persisted for ^BVSP`);
  } catch (e) {
    console.error('   FAILED:', e instanceof Error ? e.message : e);
  }
  console.log('');

  // 3. Tesouro Direto — re-sync with 30 day lookback (covers full outage window)
  console.log('─── 3/6: Tesouro Direto (30-day lookback) ───');
  try {
    const { runTesouroDiretoSync } = await import('../src/services/pricing/tesouroDiretoSync');
    const result = await runTesouroDiretoSync(30);
    console.log(
      `   OK: ${result.inserted} inserted, ${result.updated} updated, latest: ${result.latestDate}`,
    );
  } catch (e) {
    console.error('   FAILED:', e instanceof Error ? e.message : e);
  }
  console.log('');

  // 4. BRAPI prices — sync all scopes
  console.log('─── 4/6: BRAPI Prices ───');
  try {
    const { syncCatalog, syncPricesByScope } = await import('../src/services/pricing/brapiSync');

    console.log('   2a. Catalog sync...');
    const catalogResult = await syncCatalog();
    console.log(
      `   OK: ${catalogResult.total.inserted} inserted, ${catalogResult.total.updated} updated`,
    );

    console.log('   2b. Crypto + currency prices...');
    const cryptoResult = await syncPricesByScope('crypto-currencies');
    console.log(
      `   OK: ${cryptoResult.totalInserted} inserted, ${cryptoResult.totalUpdated} updated`,
    );

    console.log('   2c. Stock prices...');
    const stockResult = await syncPricesByScope('stocks');
    console.log(
      `   OK: ${stockResult.totalInserted} inserted, ${stockResult.totalUpdated} updated`,
    );
  } catch (e) {
    console.error('   FAILED:', e instanceof Error ? e.message : e);
  }
  console.log('');

  // 5. CVM Fund Sync
  console.log('─── 5/6: CVM Fund Sync ───');
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

  // 6. Portfolio Snapshots — rebuild full history for all users
  console.log('─── 6/6: Portfolio Snapshots (full rebuild) ───');
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

    console.log(`   Found ${users.length} users with portfolios`);

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

        // Write ALL snapshots (full rebuild, not just tail)
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

        // Write ALL performance entries
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
