/**
 * Restaura eventos corporativos (splits/grupamentos) que foram removidos por
 * engano pela validação anti-espúrio (que usava preço BRAPI ajustado e dava
 * falso-positivo em splits REAIS — ex.: HFOF11 10:1). Re-sincroniza do Yahoo e
 * recalcula as posições afetadas.
 *
 * Uso:
 *   tsx --env-file=.env scripts/restore-corporate-actions.ts HFOF11 TEPP11 ...          # DRY-RUN
 *   tsx --env-file=.env scripts/restore-corporate-actions.ts HFOF11 TEPP11 ... --apply
 */
import { prisma } from '@/lib/prisma';
import { fetchYahooSplits, syncYahooSplits } from '@/services/pricing/yahooCorporateActions';
import { recalculatePortfolioFromTransactions } from '@/services/portfolio/portfolioRecalculation';
import { applyCorporateActionsToUserPositions } from '@/services/portfolio/applyCorporateActions';

async function main() {
  const apply = process.argv.includes('--apply');
  const symbols = process.argv
    .slice(2)
    .filter((a) => !a.startsWith('--'))
    .map((s) => s.trim().toUpperCase());
  if (symbols.length === 0) throw new Error('passe os símbolos: ... HFOF11 TEPP11');

  console.log(
    `\n${apply ? '🟢 APPLY' : '🟡 DRY-RUN'} — restaurar eventos (Yahoo): ${symbols.join(', ')}\n`,
  );

  for (const sym of symbols) {
    if (apply) {
      const n = await syncYahooSplits(sym);
      console.log(`  ${sym.padEnd(8)} → ${n} evento(s) re-sincronizado(s) do Yahoo`);
    } else {
      const splits = await fetchYahooSplits(sym);
      const desc = splits
        .map((s) => `${s.completeFactor}@${s.date.toISOString().slice(0, 10)}`)
        .join(', ');
      console.log(
        `  ${sym.padEnd(8)} → Yahoo tem ${splits.length} evento(s)${desc ? ': ' + desc : ''}`,
      );
    }
  }

  if (!apply) {
    console.log('\n(dry-run — rode com --apply pra restaurar e recalcular)\n');
    return;
  }

  const portfolios = await prisma.portfolio.findMany({
    where: { asset: { symbol: { in: symbols } } },
    select: { id: true, userId: true, assetId: true, asset: { select: { symbol: true } } },
  });
  console.log(`\nRecalculando ${portfolios.length} posição(ões) afetada(s)…`);
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
