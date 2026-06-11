/**
 * Invalida os snapshots diários (portfolio_daily_snapshots + performance) de uma
 * conta, recalculando a partir de uma data antiga. O reader (resumo) cai pro
 * builder ao vivo até o próximo repopular — usado pra forçar o re-cálculo da
 * série com código corrigido (ex.: fix da data-ex de proventos).
 *
 * Uso: tsx --env-file=.env scripts/refresh-qa-snapshots.ts [email]
 */
import { prisma } from '@/lib/prisma';
import { recalculatePortfolioFromTransactions } from '@/services/portfolio/portfolioRecalculation';

async function main() {
  const email = process.argv[2] || 'qa.teste@appmyfinance.com.br';
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!u) throw new Error(`usuário não encontrado: ${email}`);

  const ports = await prisma.portfolio.findMany({
    where: { userId: u.id },
    select: { id: true, assetId: true, asset: { select: { symbol: true } } },
  });
  console.log(`\nInvalidando snapshots de ${email} — ${ports.length} posição(ões)\n`);

  const from = new Date(Date.UTC(2010, 0, 1)); // bem antigo: invalida tudo
  let ok = 0;
  for (const p of ports) {
    try {
      await recalculatePortfolioFromTransactions({
        targetUserId: u.id,
        assetId: p.assetId,
        portfolioId: p.id,
        recomputeSnapshotsFrom: from,
      });
      console.log(`  ✓ ${p.asset?.symbol ?? p.id}`);
      ok++;
    } catch (e) {
      console.log(`  ✗ ${p.asset?.symbol}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(
    `\n✅ ${ok}/${ports.length} — snapshots invalidados; próxima leitura do resumo reconstrói ao vivo.\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
