/**
 * Remove eventos corporativos ESPÚRIOS (splits/grupamentos falsos dos feeds que
 * inflam/deflacionam a posição) confrontando o fator com o salto de preço real,
 * e recalcula as posições afetadas. Ver corporateActionValidation.ts.
 *
 * Uso:
 *   tsx --env-file=.env scripts/validate-corporate-actions.ts          # DRY-RUN
 *   tsx --env-file=.env scripts/validate-corporate-actions.ts --apply  # remove + recalcula
 */
import { prisma } from '@/lib/prisma';
import { findSpuriousCorporateActions } from '@/services/pricing/corporateActionValidation';
import { recalculatePortfolioFromTransactions } from '@/services/portfolio/portfolioRecalculation';
import { applyCorporateActionsToUserPositions } from '@/services/portfolio/applyCorporateActions';

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(
    `\n${apply ? '🟢 APPLY' : '🟡 DRY-RUN'} — validação de eventos corporativos via preço\n`,
  );

  const { spurious, checked, affectedSymbols } = await findSpuriousCorporateActions({ apply });
  console.log(`Verificados (fator detectável): ${checked}`);
  console.log(`ESPÚRIOS ${apply ? 'removidos' : 'a remover'}: ${spurious.length}\n`);
  for (const s of spurious.slice(0, 60)) {
    console.log(
      `  ✗ ${s.symbol.padEnd(8)} ${s.date.toISOString().slice(0, 10)} ${s.type} ×${s.factor}`,
    );
  }
  if (spurious.length > 60) console.log(`  … +${spurious.length - 60}`);

  if (!apply) {
    console.log('\n(dry-run — rode com --apply pra remover e recalcular)\n');
    return;
  }
  if (affectedSymbols.length === 0) return;

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
  console.log(`✅ ${ok}/${portfolios.length} recalculadas\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
