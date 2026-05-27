/**
 * Bug F1.9: até a fix, AssetFundamentals tinha apenas 10 linhas (de 2.794
 * stocks/fiis/etfs/reits/fim-fia elegíveis no catálogo BRAPI) — todas com
 * beta/dividendYield NULL porque o serviço chamava `?fundamental=true`, que
 * não devolve esses campos.
 *
 * Este backfill chama o módulo `defaultKeyStatistics` da BRAPI em batch pra
 * todos os symbols ativos e popula AssetFundamentals com P/L (trailingPE),
 * beta e dividendYield (já em percentual).
 *
 * Idempotente: roda upsert, mesma execução em sequência produz o mesmo
 * resultado final. Espelha a lógica do cron `/api/cron/brapi-sync/fundamentals`,
 * mas executável fora do contexto Vercel (sem limite de 60s).
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/backfill-fundamentals.ts          # dry run
 *   npx tsx --env-file=.env scripts/backfill-fundamentals.ts --apply  # persiste
 *   npx tsx --env-file=.env scripts/backfill-fundamentals.ts --apply --symbols=PETR4,ITUB4
 */
import { prisma } from '@/lib/prisma';
import { syncFundamentalsForSymbols } from '@/services/pricing/fundamentalsService';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const symbolsArg = args.find((a) => a.startsWith('--symbols='));
  const onlySymbols = symbolsArg
    ? symbolsArg
        .replace('--symbols=', '')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : null;

  console.log(`🔧 Backfill AssetFundamentals (${apply ? 'APPLY' : 'DRY RUN'})\n`);

  let symbols: string[];
  if (onlySymbols && onlySymbols.length > 0) {
    symbols = onlySymbols;
    console.log(`Limitado a ${symbols.length} symbols passados via --symbols\n`);
  } else {
    const assets = await prisma.asset.findMany({
      where: {
        type: { in: ['stock', 'fii', 'etf', 'reit', 'fim-fia'] },
        source: 'brapi',
      },
      select: { symbol: true },
      distinct: ['symbol'],
      orderBy: { symbol: 'asc' },
    });
    symbols = assets.map((a) => a.symbol).filter((s) => /^[A-Z][A-Z0-9.]*$/i.test(s));
    console.log(`Encontrados ${symbols.length} symbols elegíveis (stock/fii/etf/reit/fim-fia)\n`);
  }

  // Snapshot de quantos têm fundamentos antes da execução, pra reportar delta.
  const before = await prisma.assetFundamentals.count();
  const beforeWithData = await prisma.assetFundamentals.count({
    where: {
      OR: [
        { priceEarnings: { not: null } },
        { beta: { not: null } },
        { dividendYield: { not: null } },
      ],
    },
  });
  console.log(
    `Antes: ${before} linhas em AssetFundamentals, ${beforeWithData} com pelo menos um campo populado\n`,
  );

  if (!apply) {
    console.log('Dry run — re-rode com --apply para persistir.');
    await prisma.$disconnect();
    return;
  }

  const start = Date.now();
  const result = await syncFundamentalsForSymbols(symbols);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  const after = await prisma.assetFundamentals.count();
  const afterWithData = await prisma.assetFundamentals.count({
    where: {
      OR: [
        { priceEarnings: { not: null } },
        { beta: { not: null } },
        { dividendYield: { not: null } },
      ],
    },
  });

  console.log(`\n✅ Concluído em ${elapsed}s`);
  console.log(`   Processados: ${result.processed}`);
  console.log(`   Upserts:     ${result.updated}`);
  console.log(`   Com dados:   ${result.withData}`);
  console.log(`   Erros:       ${result.errors.length}`);
  console.log(`\nDepois: ${after} linhas em AssetFundamentals (+${after - before})`);
  console.log(
    `        ${afterWithData} com pelo menos um campo populado (+${afterWithData - beforeWithData})`,
  );

  if (result.errors.length > 0) {
    console.log('\nErros (primeiros 10):');
    for (const e of result.errors.slice(0, 10)) {
      console.log(`  ${e.symbol}: ${e.error}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
