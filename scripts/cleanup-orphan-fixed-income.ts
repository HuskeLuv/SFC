/**
 * Lista (e opcionalmente remove) FixedIncomeAssets ÓRFÃOS: rows sem Portfolio
 * correspondente em (userId, assetId). Órfãos surgem de exclusões de ativo
 * feitas antes do fix na rota DELETE /api/ativos/[id]/portfolio, que apagava
 * transações + Portfolio mas esquecia o FixedIncomeAsset.
 *
 * Efeito dos órfãos: invisíveis na carteira/abas (que iteram Portfolio), mas
 * ainda contados como cash flow no MWR e visíveis nas análises que leem FI
 * direto (sensibilidade, risco-retorno, rentabilidade-janelas, export).
 *
 * No --apply, além de deletar, invalida os snapshots de cada usuário afetado
 * a partir do menor startDate dos órfãos removidos (a série persistida foi
 * construída com o FI dentro).
 *
 * Uso: tsx --env-file=.env scripts/cleanup-orphan-fixed-income.ts [--apply]
 */
import { prisma } from '@/lib/prisma';
import { invalidatePortfolioSnapshots } from '@/services/portfolio/portfolioRecalculation';

async function main() {
  const apply = process.argv.includes('--apply');

  const all = await prisma.fixedIncomeAsset.findMany({
    include: { user: { select: { email: true } } },
  });
  const portfolios = await prisma.portfolio.findMany({
    where: { assetId: { not: null } },
    select: { userId: true, assetId: true },
  });
  const portfolioKeys = new Set(portfolios.map((p) => `${p.userId}:${p.assetId}`));

  const orphans = all.filter((fi) => !portfolioKeys.has(`${fi.userId}:${fi.assetId}`));

  console.log(`\nFixedIncomeAssets: ${all.length} total, ${orphans.length} órfãos\n`);
  let totalOrfao = 0;
  for (const fi of orphans) {
    totalOrfao += fi.investedAmount;
    console.log(
      `  ${fi.user.email}  ${fi.type}  "${fi.description}"  ` +
        `R$ ${fi.investedAmount.toFixed(2)}  start=${fi.startDate.toISOString().slice(0, 10)}  ` +
        `assetId=${fi.assetId}`,
    );
  }
  if (orphans.length > 0) {
    console.log(`\n  Total órfão: R$ ${totalOrfao.toFixed(2)}\n`);
  }

  if (!apply) {
    console.log('(dry-run — rode com --apply pra remover os órfãos)\n');
    return;
  }

  const byUser = new Map<string, { ids: string[]; minStart: Date }>();
  for (const fi of orphans) {
    const entry = byUser.get(fi.userId) ?? { ids: [], minStart: fi.startDate };
    entry.ids.push(fi.id);
    if (fi.startDate < entry.minStart) entry.minStart = fi.startDate;
    byUser.set(fi.userId, entry);
  }

  for (const [userId, { ids, minStart }] of byUser) {
    const del = await prisma.fixedIncomeAsset.deleteMany({ where: { id: { in: ids } } });
    await invalidatePortfolioSnapshots(userId, minStart);
    console.log(
      `✅ user ${userId}: ${del.count} órfãos removidos, snapshots invalidados desde ${minStart.toISOString().slice(0, 10)}`,
    );
  }
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
