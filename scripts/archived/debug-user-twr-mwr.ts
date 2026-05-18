/**
 * Debug TWR/MWR de um usuário específico.
 *
 * Uso:
 *   npx tsx scripts/debug-user-twr-mwr.ts <email>
 */
import prisma from '../src/lib/prisma';

async function main() {
  const email = process.argv[2] || 'testekinvo@hotmail.com';
  const candidates = [email];
  // tolerar "kivo" vs "kinvo" — bug de digitação comum
  if (email.includes('kivo')) candidates.push(email.replace('kivo', 'kinvo'));
  if (email.includes('kinvo')) candidates.push(email.replace('kinvo', 'kivo'));

  const user = await prisma.user.findFirst({
    where: { email: { in: candidates } },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    console.error(`Nenhum usuário encontrado em: ${candidates.join(', ')}`);
    process.exit(1);
  }
  console.log(`\nUsuário: ${user.name} <${user.email}> (${user.id})\n`);

  // Portfolio
  const portfolio = await prisma.portfolio.findMany({
    where: { userId: user.id },
    include: { asset: { select: { symbol: true, name: true, type: true, currency: true } } },
  });
  console.log(`=== Portfolio (${portfolio.length} posições) ===`);
  for (const p of portfolio) {
    console.log(
      `  ${p.asset?.symbol ?? '-'} [${p.asset?.type ?? '?'}] qty=${p.quantity} avg=${p.avgPrice.toFixed(2)} totalInv=${p.totalInvested.toFixed(2)}`,
    );
  }

  // Transactions
  const txs = await prisma.stockTransaction.findMany({
    where: { userId: user.id },
    include: { asset: { select: { symbol: true, type: true } } },
    orderBy: { date: 'asc' },
  });
  console.log(`\n=== Transactions (${txs.length}) ===`);
  for (const t of txs) {
    const valor = (Number(t.quantity) * Number(t.price)).toFixed(2);
    console.log(
      `  ${t.date.toISOString().slice(0, 10)} ${t.type.padEnd(7)} ${(t.asset?.symbol ?? '-').padEnd(10)} qty=${t.quantity} price=${t.price.toFixed(2)} total=${t.total.toFixed(2)} val=${valor}`,
    );
  }

  // Daily snapshots (últimos 30)
  const snapshots = await prisma.portfolioDailySnapshot.findMany({
    where: { userId: user.id },
    orderBy: { date: 'desc' },
    take: 30,
  });
  console.log(`\n=== Daily Snapshots (últimos ${snapshots.length}) ===`);
  for (const s of snapshots.reverse()) {
    console.log(
      `  ${s.date.toISOString().slice(0, 10)} bruto=${Number(s.totalValue).toFixed(2).padStart(12)} aplicado=${Number(s.totalInvested).toFixed(2).padStart(12)} earnings=${Number(s.totalEarnings).toFixed(2).padStart(10)}`,
    );
  }

  // TWR performance (últimos 30)
  const perfs = await prisma.portfolioPerformance.findMany({
    where: { userId: user.id },
    orderBy: { date: 'desc' },
    take: 30,
  });
  console.log(`\n=== Performance TWR (últimos ${perfs.length}) ===`);
  let prevTwr: number | null = null;
  for (const p of perfs.reverse()) {
    const twr = Number(p.cumulativeReturn);
    const daily = p.dailyReturn != null ? Number(p.dailyReturn) : null;
    const dailyPct = daily != null ? (daily * 100).toFixed(3) + '%' : '-';
    const drop = prevTwr != null ? ((1 + twr / 100) / (1 + prevTwr / 100) - 1) * 100 : null;
    const dropStr = drop != null ? drop.toFixed(2) + '%' : '-';
    console.log(
      `  ${p.date.toISOString().slice(0, 10)} cumTWR=${twr.toFixed(2).padStart(8)}% daily=${dailyPct.padStart(8)} dropFromPrev=${dropStr.padStart(8)}`,
    );
    prevTwr = twr;
  }

  // Procurar saltos suspeitos em toda a série
  const allPerfs = await prisma.portfolioPerformance.findMany({
    where: { userId: user.id },
    orderBy: { date: 'asc' },
  });
  console.log(`\n=== Saltos diários > |10%| em toda a série (${allPerfs.length} pontos) ===`);
  let prev: number | null = null;
  const saltos: Array<{ date: Date; from: number; to: number; delta: number }> = [];
  for (const p of allPerfs) {
    const twr = Number(p.cumulativeReturn);
    if (prev != null) {
      const fromFrac = 1 + prev / 100;
      const toFrac = 1 + twr / 100;
      const delta = fromFrac > 0 ? (toFrac / fromFrac - 1) * 100 : 0;
      if (Math.abs(delta) > 10) {
        saltos.push({ date: p.date, from: prev, to: twr, delta });
      }
    }
    prev = twr;
  }
  for (const s of saltos) {
    console.log(
      `  ${s.date.toISOString().slice(0, 10)}: ${s.from.toFixed(2)}% → ${s.to.toFixed(2)}% (delta ${s.delta.toFixed(2)}%)`,
    );
  }
  if (saltos.length === 0) console.log('  (nenhum)');

  // Snapshots negativos
  const negativeSnaps = await prisma.portfolioDailySnapshot.findMany({
    where: { userId: user.id, totalValue: { lt: 0 } },
    orderBy: { date: 'asc' },
    take: 20,
  });
  console.log(`\n=== Snapshots com totalValue < 0 (primeiros ${negativeSnaps.length}) ===`);
  for (const s of negativeSnaps) {
    console.log(
      `  ${s.date.toISOString().slice(0, 10)} bruto=${Number(s.totalValue).toFixed(2)} aplicado=${Number(s.totalInvested).toFixed(2)}`,
    );
  }

  // Cashflow groups que viram aporte
  const investmentGroups = await prisma.cashflowGroup.count({
    where: { userId: user.id, type: 'investimento' },
  });
  console.log(`\n=== Cashflow groups (type=investimento): ${investmentGroups} ===`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('❌', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
