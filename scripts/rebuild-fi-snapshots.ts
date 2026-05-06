/**
 * Rebuild de PortfolioDailySnapshot e PortfolioPerformance pós-fix de feriados B3.
 *
 * Snapshots gravados ANTES do fix (2026-05-06) têm `totalValue` inflado em
 * usuários com RF PRE-fixada/IPCA-híbrida porque `buildDailyTimeline` não
 * filtrava feriados nacionais — o pricer compunha `dailyPreFactor` em ~10-13
 * dias/ano a mais. Este script:
 *
 *   1. Lista usuários com atividade (portfolio OU stockTransaction)
 *   2. Pra cada usuário:
 *      a. Carrega snapshots EXISTENTES pra mostrar delta antes/depois
 *      b. Roda buildPatrimonioHistorico com max=null (série completa)
 *      c. DELETE de snapshots/perfs em datas fora da nova série (feriados órfãos)
 *      d. UPSERT da série completa (snapshots + performances)
 *      e. Imprime delta agregado
 *
 * Flags:
 *   --dry          : só imprime delta, não escreve
 *   --user=<uuid>  : roda só pra esse usuário
 *   --batch=<n>    : tamanho do batch upsert (default 50)
 *
 * Run: npx tsx scripts/rebuild-fi-snapshots.ts [--dry] [--user=<id>]
 */
import { PrismaClient } from '@prisma/client';
import {
  normalizeDateStart,
  buildPatrimonioHistorico,
} from '@/services/portfolio/patrimonioHistoricoBuilder';
import { loadCarteiraHistoricoData } from '@/services/portfolio/carteiraHistoricoDataLoader';
import { createFixedIncomePricer } from '@/services/portfolio/fixedIncomePricing';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const isDry = args.includes('--dry');
const userArg = args.find((a) => a.startsWith('--user='))?.slice('--user='.length);
const batchArg = args.find((a) => a.startsWith('--batch='))?.slice('--batch='.length);
const batchSize = batchArg ? Number(batchArg) : 50;

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;

const toDayDate = (ts: number): Date => normalizeDateStart(new Date(ts));

interface UserResult {
  userId: string;
  email: string;
  status: 'ok' | 'no-history' | 'failed';
  oldSnapshots: number;
  newSnapshots: number;
  deletedSnapshots: number;
  oldLatestValue: number | null;
  newLatestValue: number | null;
  durationMs: number;
  error?: string;
}

async function rebuildOne(userId: string, email: string, endDate: Date): Promise<UserResult> {
  const start = Date.now();
  const result: UserResult = {
    userId,
    email,
    status: 'ok',
    oldSnapshots: 0,
    newSnapshots: 0,
    deletedSnapshots: 0,
    oldLatestValue: null,
    newLatestValue: null,
    durationMs: 0,
  };

  try {
    // 1) Snapshots existentes pra delta
    const existingSnaps = await prisma.portfolioDailySnapshot.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 1,
    });
    const allExistingCount = await prisma.portfolioDailySnapshot.count({ where: { userId } });
    result.oldSnapshots = allExistingCount;
    if (existingSnaps.length > 0) {
      result.oldLatestValue = Number(existingSnaps[0].totalValue);
    }

    // 2) Recompute série completa
    const data = await loadCarteiraHistoricoData(userId);
    const fiPricer = await createFixedIncomePricer(userId, { asOfDate: endDate });
    const { historicoPatrimonio, historicoTWR } = await buildPatrimonioHistorico({
      ...data,
      saldoBrutoAtual: 0,
      valorAplicadoAtual: 0,
      maxHistoricoMonths: null,
      patchLastDayWithLiveTotals: false,
      timelineEndDate: endDate,
      fixedIncomeValueSeriesBuilder: fiPricer.buildValueSeriesForAsset,
      implicitCdiValueSeriesBuilder: fiPricer.buildImplicitCdiValueSeries,
    });

    if (historicoPatrimonio.length === 0) {
      result.status = 'no-history';
      result.durationMs = Date.now() - start;
      return result;
    }
    result.newSnapshots = historicoPatrimonio.length;
    result.newLatestValue = historicoPatrimonio[historicoPatrimonio.length - 1].saldoBruto;

    if (isDry) {
      result.durationMs = Date.now() - start;
      return result;
    }

    // 3) DELETE snapshots/perfs em datas fora da nova série (feriados órfãos)
    const newDateTimestamps = new Set(historicoPatrimonio.map((r) => toDayDate(r.data).getTime()));
    const orphanSnaps = await prisma.portfolioDailySnapshot.findMany({
      where: { userId },
      select: { id: true, date: true },
    });
    const orphanIds = orphanSnaps
      .filter((s) => !newDateTimestamps.has(s.date.getTime()))
      .map((s) => s.id);
    if (orphanIds.length > 0) {
      await prisma.portfolioDailySnapshot.deleteMany({ where: { id: { in: orphanIds } } });
      result.deletedSnapshots = orphanIds.length;
    }
    const orphanPerfs = await prisma.portfolioPerformance.findMany({
      where: { userId },
      select: { id: true, date: true },
    });
    const orphanPerfIds = orphanPerfs
      .filter((p) => !newDateTimestamps.has(p.date.getTime()))
      .map((p) => p.id);
    if (orphanPerfIds.length > 0) {
      await prisma.portfolioPerformance.deleteMany({ where: { id: { in: orphanPerfIds } } });
    }

    // 4) UPSERT série completa em batches
    for (let i = 0; i < historicoPatrimonio.length; i += batchSize) {
      const slice = historicoPatrimonio.slice(i, i + batchSize);
      await prisma.$transaction(
        slice.map((row) => {
          const day = toDayDate(row.data);
          return prisma.portfolioDailySnapshot.upsert({
            where: { userId_date: { userId, date: day } },
            create: {
              userId,
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
            where: { userId_date: { userId, date: day } },
            create: { userId, date: day, dailyReturn, cumulativeReturn: row.value },
            update: { dailyReturn, cumulativeReturn: row.value },
          });
        }),
      );
    }

    result.durationMs = Date.now() - start;
    return result;
  } catch (e) {
    result.status = 'failed';
    result.error = e instanceof Error ? e.message : String(e);
    result.durationMs = Date.now() - start;
    return result;
  }
}

async function main() {
  const where = userArg
    ? { id: userArg }
    : { OR: [{ portfolios: { some: {} } }, { stockTransactions: { some: {} } }] };
  const users = await prisma.user.findMany({
    where,
    select: { id: true, email: true },
    orderBy: { createdAt: 'asc' },
  });

  if (users.length === 0) {
    console.log('Nenhum usuário encontrado.');
    return;
  }

  console.log(
    `${isDry ? '[DRY RUN] ' : ''}Rebuild para ${users.length} usuário(s) (batch=${batchSize})\n`,
  );

  const endDate = normalizeDateStart(new Date());
  endDate.setDate(endDate.getDate() - 1);

  const results: UserResult[] = [];
  for (const u of users) {
    process.stdout.write(`  ${u.email.padEnd(40)} `);
    const r = await rebuildOne(u.id, u.email, endDate);
    results.push(r);
    if (r.status === 'failed') {
      console.log(`FAILED  ${r.error}`);
    } else if (r.status === 'no-history') {
      console.log('skip (sem histórico)');
    } else {
      const deltaStr =
        r.oldLatestValue != null && r.newLatestValue != null
          ? ` Δ=${fmtBRL(r.newLatestValue - r.oldLatestValue)} (${fmtPct(r.newLatestValue / r.oldLatestValue - 1)})`
          : '';
      console.log(
        `${String(r.newSnapshots).padStart(4)} snaps  ` +
          `${r.deletedSnapshots > 0 ? `-${r.deletedSnapshots} órfãos  ` : ''}` +
          `latest: ${r.oldLatestValue != null ? fmtBRL(r.oldLatestValue) : '—'} → ${r.newLatestValue != null ? fmtBRL(r.newLatestValue) : '—'}${deltaStr}` +
          `  (${(r.durationMs / 1000).toFixed(1)}s)`,
      );
    }
  }

  // Resumo
  console.log('\n═══════════════════════════════════════════════');
  console.log('  RESUMO');
  console.log('═══════════════════════════════════════════════');
  const ok = results.filter((r) => r.status === 'ok');
  const failed = results.filter((r) => r.status === 'failed');
  const nohist = results.filter((r) => r.status === 'no-history');
  console.log(`OK:           ${ok.length}`);
  console.log(`Sem histórico: ${nohist.length}`);
  console.log(`Falharam:      ${failed.length}`);
  console.log(`Total snapshots persistidos: ${ok.reduce((s, r) => s + r.newSnapshots, 0)}`);
  console.log(
    `Total snapshots órfãos removidos: ${ok.reduce((s, r) => s + r.deletedSnapshots, 0)}`,
  );

  // Top deltas (saldo histórico)
  const withDelta = ok
    .filter((r) => r.oldLatestValue != null && r.newLatestValue != null)
    .map((r) => ({ ...r, delta: r.newLatestValue! - r.oldLatestValue! }))
    .filter((r) => Math.abs(r.delta) > 1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  if (withDelta.length > 0) {
    console.log('\nDeltas no saldo bruto mais recente (top 10):');
    withDelta.slice(0, 10).forEach((r) => {
      console.log(
        `  ${r.email.padEnd(40)}  ${fmtBRL(r.oldLatestValue!)} → ${fmtBRL(r.newLatestValue!)}  ${fmtPct(r.delta / r.oldLatestValue!)}`,
      );
    });
  } else {
    console.log('\nNenhum delta significativo (>R$ 1,00) detectado.');
  }

  if (failed.length > 0) {
    console.log('\nFalhas:');
    failed.forEach((r) => console.log(`  ${r.email}: ${r.error}`));
  }
}

main()
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
