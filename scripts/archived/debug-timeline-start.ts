import prisma from '../src/lib/prisma';

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { in: ['testekinvo@hotmail.com'] } },
  });
  if (!user) return;

  const minTx = await prisma.stockTransaction.aggregate({
    where: { userId: user.id },
    _min: { date: true },
  });
  const minFi = await prisma.fixedIncomeAsset.aggregate({
    where: { userId: user.id },
    _min: { startDate: true },
  });
  const earliestTx = await prisma.stockTransaction.findMany({
    where: { userId: user.id },
    orderBy: { date: 'asc' },
    take: 5,
    include: { asset: { select: { symbol: true } } },
  });

  console.log(`Earliest transaction date: ${minTx._min.date?.toISOString()}`);
  console.log(`Earliest fixedIncome startDate: ${minFi._min.startDate?.toISOString()}`);
  console.log(`\nFirst 5 transactions:`);
  for (const t of earliestTx) {
    console.log(
      `  ${t.date.toISOString().slice(0, 10)} ${t.type} ${t.asset?.symbol} qty=${t.quantity}`,
    );
  }

  // Quem tem startDate mais antiga
  const earliestFi = await prisma.fixedIncomeAsset.findFirst({
    where: { userId: user.id },
    orderBy: { startDate: 'asc' },
    include: { asset: { select: { symbol: true } } },
  });
  console.log(
    `\nFI mais antigo: ${earliestFi?.startDate.toISOString().slice(0, 10)} | ${earliestFi?.asset?.symbol} | inv=${earliestFi?.investedAmount}`,
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
