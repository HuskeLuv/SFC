/**
 * Rebuild portfolio snapshots for remaining users.
 * Run with: npx tsx scripts/backfill-snapshots.ts
 */

import { PrismaClient } from '@prisma/client';
import {
  normalizeDateStart,
  buildPatrimonioHistorico,
} from '../src/services/portfolio/patrimonioHistoricoBuilder';
import { loadCarteiraHistoricoData } from '../src/services/portfolio/carteiraHistoricoDataLoader';

const prisma = new PrismaClient();

const DONE_USERS = ['af68dd3e-c158-44cd-87ba-261bfe7bc97b', 'a1f097fe-f510-4409-80d4-84115788e5d5'];

async function rebuildRemaining() {
  const users = await prisma.user.findMany({
    where: {
      id: { notIn: DONE_USERS },
      OR: [{ portfolios: { some: {} } }, { stockTransactions: { some: {} } }],
    },
    select: { id: true },
  });

  console.log(`Remaining users: ${users.length}`);

  const batchSize = 50;
  const yesterday = normalizeDateStart(new Date());
  yesterday.setDate(yesterday.getDate() - 1);
  const toDayDate = (ts: number): Date => normalizeDateStart(new Date(ts));

  for (const user of users) {
    const start = Date.now();
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

      if (historicoPatrimonio.length === 0) {
        console.log(`User ${user.id}: no history, skipping`);
        continue;
      }

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
      }

      const dur = ((Date.now() - start) / 1000).toFixed(1);
      console.log(
        `User ${user.id}: ${historicoPatrimonio.length} snapshots, ${historicoTWR.length} perfs (${dur}s)`,
      );
    } catch (e) {
      const dur = ((Date.now() - start) / 1000).toFixed(1);
      console.error(`User ${user.id} FAILED (${dur}s):`, e instanceof Error ? e.message : e);
    }
  }

  await prisma.$disconnect();
  console.log('Done!');
}

rebuildRemaining().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
