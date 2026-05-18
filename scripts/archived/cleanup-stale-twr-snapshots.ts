/**
 * Limpa snapshots TWR contaminados por `cumulativeReturn = -100%`
 * (resultado do bug no clamp do `calculateHistoricoTWR` que permitia
 * retornoDia=-1 zerar o cumulative permanentemente).
 *
 * Estratégia: identificar usuários onde ALGUM ponto da série em
 * `portfolio_performance` tem cumulativeReturn <= -99%. Para cada um,
 * apagar TODA a série em `portfolio_performance` e `portfolio_daily_snapshots`
 * — o reader cai no fallback live builder até o próximo cron repovoar.
 *
 * Uso:
 *   npx tsx scripts/cleanup-stale-twr-snapshots.ts [--dry-run]
 */
import prisma from '../src/lib/prisma';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? '🔍 Modo dry-run\n' : '🗑️  Apagando snapshots contaminados\n');

  // Encontra todos os user_id com pelo menos um snapshot <= -99%
  const corrupted = await prisma.portfolioPerformance.groupBy({
    by: ['userId'],
    where: { cumulativeReturn: { lte: -99 } },
    _count: { _all: true },
    _min: { date: true },
    _max: { date: true },
  });

  console.log(`Usuários com snapshots TWR <= -99%: ${corrupted.length}`);

  for (const c of corrupted) {
    const user = await prisma.user.findUnique({
      where: { id: c.userId },
      select: { email: true, name: true },
    });
    console.log(
      `  ${user?.email ?? c.userId} | ${c._count._all} pontos contaminados | ${c._min.date?.toISOString().slice(0, 10)} → ${c._max.date?.toISOString().slice(0, 10)}`,
    );

    if (!dryRun) {
      const [perfDeleted, snapDeleted] = await prisma.$transaction([
        prisma.portfolioPerformance.deleteMany({ where: { userId: c.userId } }),
        prisma.portfolioDailySnapshot.deleteMany({ where: { userId: c.userId } }),
      ]);
      console.log(
        `    ↳ apagados ${perfDeleted.count} performance + ${snapDeleted.count} snapshots`,
      );
    }
  }

  if (corrupted.length === 0) {
    console.log('Nenhum usuário afetado.');
  } else if (dryRun) {
    console.log(`\n(dry-run) Reexecute sem --dry-run para apagar.`);
  } else {
    console.log(
      `\n✓ Limpeza completa. O próximo carregamento de Análises cai no live builder; o cron diário repovoa os snapshots com os valores corretos.`,
    );
  }
}

main()
  .catch((err) => {
    console.error('❌', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
