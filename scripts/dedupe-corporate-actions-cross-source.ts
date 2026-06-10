/**
 * Limpa duplicatas CROSS-FONTE de eventos corporativos (BRAPI bonificação +
 * Yahoo split do MESMO evento → fator dobrado) e recalcula as posições afetadas.
 *
 * Complementa `dedupe-corporate-actions.ts` (que só pega duplicatas exatas de
 * mesmo tipo/data/fator por timezone). Aqui colapsa tipos/datas diferentes do
 * mesmo evento, mantendo o Yahoo canônico (ver corporateActionsDedup.ts).
 *
 * Uso:
 *   tsx --env-file=.env scripts/dedupe-corporate-actions-cross-source.ts          # DRY-RUN
 *   tsx --env-file=.env scripts/dedupe-corporate-actions-cross-source.ts --apply  # remove + recalcula
 */
import { prisma } from '@/lib/prisma';
import { dedupAllCorporateActions } from '@/services/pricing/corporateActionsDedup';
import { recalculatePortfolioFromTransactions } from '@/services/portfolio/portfolioRecalculation';
import { applyCorporateActionsToUserPositions } from '@/services/portfolio/applyCorporateActions';

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(
    `\n${apply ? '🟢 APPLY' : '🟡 DRY-RUN'} — dedup cross-fonte de eventos corporativos\n`,
  );

  const { removed, affectedSymbols } = await dedupAllCorporateActions({ dryRun: !apply });
  console.log(`Duplicatas ${apply ? 'removidas' : 'a remover'}: ${removed}`);
  console.log(`Símbolos afetados: ${affectedSymbols.length}`);
  if (affectedSymbols.length)
    console.log(
      `  ${affectedSymbols.slice(0, 40).join(', ')}${affectedSymbols.length > 40 ? ' …' : ''}`,
    );

  if (!apply) {
    console.log('\n(dry-run — rode com --apply pra remover e recalcular)\n');
    return;
  }

  // Recalcula as posições (Portfolio.quantity) que usavam o fator dobrado.
  const portfolios = await prisma.portfolio.findMany({
    where: { asset: { symbol: { in: affectedSymbols } } },
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
  console.log(`✅ ${ok}/${portfolios.length} posições recalculadas\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
