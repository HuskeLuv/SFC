/**
 * Roda o dedup de eventos corporativos (colapsa BRAPI+Yahoo do mesmo evento em
 * dias adjacentes → fator dobrado) para símbolos específicos e recalcula as
 * posições. Usado após um re-sync standalone que pulou o dedup do pipeline.
 *
 * Uso:
 *   tsx --env-file=.env scripts/cleanup-dedup-symbols.ts HFOF11 RBFM11 ... [--apply]
 */
import { prisma } from '@/lib/prisma';
import { dedupSymbolCorporateActions } from '@/services/pricing/corporateActionsDedup';
import { removeBlockedForSymbol } from '@/services/pricing/corporateActionBlocklist';
import { recalculatePortfolioFromTransactions } from '@/services/portfolio/portfolioRecalculation';
import { applyCorporateActionsToUserPositions } from '@/services/portfolio/applyCorporateActions';

async function main() {
  const apply = process.argv.includes('--apply');
  const symbols = process.argv
    .slice(2)
    .filter((a) => !a.startsWith('--'))
    .map((s) => s.trim().toUpperCase());
  if (symbols.length === 0) throw new Error('passe os símbolos');

  console.log(`\n${apply ? '🟢 APPLY' : '🟡 DRY-RUN'} — dedup de eventos: ${symbols.join(', ')}\n`);

  for (const sym of symbols) {
    const before = await prisma.assetCorporateAction.count({ where: { symbol: sym } });
    if (apply) {
      await dedupSymbolCorporateActions(sym);
      const blocked = await removeBlockedForSymbol(sym);
      const after = await prisma.assetCorporateAction.count({ where: { symbol: sym } });
      console.log(
        `  ${sym.padEnd(8)} ${before} → ${after} evento(s)${blocked ? ` (${blocked} falso[s] da blocklist removido[s])` : ''}`,
      );
    } else {
      const ca = await prisma.assetCorporateAction.findMany({
        where: { symbol: sym },
        select: { date: true, factor: true, source: true },
        orderBy: { date: 'asc' },
      });
      console.log(
        `  ${sym.padEnd(8)} ${before} evento(s): ${ca.map((c) => `${c.date.toISOString().slice(0, 10)}×${c.factor}(${c.source})`).join(', ')}`,
      );
    }
  }

  if (!apply) {
    console.log('\n(dry-run — rode com --apply pra colapsar e recalcular)\n');
    return;
  }

  const portfolios = await prisma.portfolio.findMany({
    where: { asset: { symbol: { in: symbols } } },
    select: { id: true, userId: true, assetId: true, asset: { select: { symbol: true } } },
  });
  console.log(`\nRecalculando ${portfolios.length} posição(ões)…`);
  let ok = 0;
  for (const p of portfolios) {
    try {
      await recalculatePortfolioFromTransactions({
        targetUserId: p.userId,
        assetId: p.assetId,
        portfolioId: p.id,
      });
      await applyCorporateActionsToUserPositions(p.userId, { assetId: p.assetId ?? undefined });
      ok++;
    } catch (e) {
      console.log(`  ✗ ${p.asset?.symbol}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`✅ ${ok}/${portfolios.length} recalculadas\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
