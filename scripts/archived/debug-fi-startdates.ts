import prisma from '../src/lib/prisma';

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { in: ['testekinvo@hotmail.com', 'testekivo@hotmail.com'] } },
  });
  if (!user) {
    console.error('User not found');
    process.exit(1);
  }

  const fis = await prisma.fixedIncomeAsset.findMany({
    where: { userId: user.id },
    include: { asset: { select: { symbol: true, name: true } } },
    orderBy: { startDate: 'asc' },
  });

  console.log(`\nFixedIncomeAssets de ${user.email} (${fis.length}):\n`);
  for (const fi of fis) {
    console.log(
      `  ${fi.startDate.toISOString().slice(0, 10)} → ${fi.maturityDate.toISOString().slice(0, 10)} | ${fi.type.padEnd(10)} | invested=${fi.investedAmount.toFixed(2).padStart(12)} | indexer=${fi.indexer ?? '-'} | ${fi.asset?.symbol ?? '-'}`,
    );
  }
}

main()
  .catch((err) => {
    console.error('❌', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
