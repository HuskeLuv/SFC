/**
 * Diagnóstico: por que FIIs não aparecem no wizard de adicionar ativo?
 *
 * Verifica:
 * 1. Contagem total de assets por type
 * 2. Assets com symbol terminando em '11' (típico de FII) mas classificados como 'stock'
 * 3. Sample de FIIs conhecidos (HGLG11, KNRI11, etc.) e seus types reais no DB
 * 4. Assets sem nome (name === symbol) que ainda não foram backfilled
 *
 * Uso:
 *   npx tsx scripts/diagnose-fii.ts
 */
import prisma from '@/lib/prisma';

const KNOWN_FIIS = [
  'HGLG11',
  'KNRI11',
  'MXRF11',
  'XPLG11',
  'BCFF11',
  'VISC11',
  'HGRE11',
  'XPML11',
  'KNCR11',
  'BTLG11',
];

async function main() {
  console.log('🔍 Diagnóstico de FIIs no catálogo Asset\n');

  const [totalAssets, byType, endsWith11AsStock, endsWith11AsFii, nameEqualsSymbolRaw] =
    await Promise.all([
      prisma.asset.count(),
      prisma.asset.groupBy({
        by: ['type'],
        _count: { _all: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      prisma.asset.count({
        where: { type: 'stock', symbol: { endsWith: '11' } },
      }),
      prisma.asset.count({
        where: { type: 'fii', symbol: { endsWith: '11' } },
      }),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint as count
        FROM "Asset"
        WHERE source = 'brapi' AND name = symbol
      `.catch(() => null),
    ]);
  const nameEqualsSymbol = nameEqualsSymbolRaw?.[0]?.count
    ? Number(nameEqualsSymbolRaw[0].count)
    : null;

  console.log(`Total de assets no DB: ${totalAssets}\n`);
  console.log('Distribuição por type:');
  console.table(byType.map((g) => ({ type: g.type, count: g._count._all })));

  console.log(`\n📊 Symbols terminando em '11':`);
  console.log(
    `   - como type='stock': ${endsWith11AsStock}  ← suspeitos de serem FIIs mal-classificados`,
  );
  console.log(`   - como type='fii':   ${endsWith11AsFii}`);

  if (nameEqualsSymbol !== null) {
    console.log(`\n📝 Assets BRAPI com name === symbol (sem backfill): ${nameEqualsSymbol}`);
  }

  console.log('\n🎯 FIIs conhecidos do mercado — status no DB:');
  const knownInDb = await prisma.asset.findMany({
    where: { symbol: { in: KNOWN_FIIS } },
    select: { symbol: true, name: true, type: true, source: true },
    orderBy: { symbol: 'asc' },
  });

  if (knownInDb.length === 0) {
    console.log('   ❌ NENHUM dos FIIs conhecidos está no DB.');
    console.log('   → O cron BRAPI catalog provavelmente nunca rodou OU não populou FIIs.');
  } else {
    console.table(knownInDb);
    const missing = KNOWN_FIIS.filter((s) => !knownInDb.find((a) => a.symbol === s));
    if (missing.length > 0) {
      console.log(`\n   Faltando no DB: ${missing.join(', ')}`);
    }
    const misclassified = knownInDb.filter((a) => a.type !== 'fii');
    if (misclassified.length > 0) {
      console.log(`\n   ⚠️ Mal-classificados (deveriam ser type='fii'):`);
      console.table(misclassified);
    }
  }

  console.log('\n📋 Sample de symbols terminando em 11 com type=stock (até 15):');
  const suspects = await prisma.asset.findMany({
    where: { type: 'stock', symbol: { endsWith: '11' } },
    select: { symbol: true, name: true, source: true },
    orderBy: { symbol: 'asc' },
    take: 15,
  });
  if (suspects.length > 0) {
    console.table(suspects);
  } else {
    console.log('   (nenhum)');
  }

  // Diagnóstico final
  console.log('\n💡 Diagnóstico:');
  const fiiCount = byType.find((g) => g.type === 'fii')?._count._all || 0;
  if (fiiCount === 0) {
    console.log('   ❌ ZERO FIIs no DB. Possíveis causas:');
    console.log('      - Cron BRAPI catalog nunca rodou neste ambiente');
    console.log('      - Ou o sync rodou mas a classificação falhou totalmente');
    console.log('   → Próximo passo: rodar `npx tsx scripts/sync-external-data.ts`');
    console.log('     ou disparar /api/cron/brapi-sync/catalog manualmente');
  } else if (fiiCount < 50) {
    console.log(`   ⚠️ Só ${fiiCount} FIIs no DB (mercado tem ~250+). Sync incompleto.`);
    console.log('   → Rodar `npx tsx scripts/backfill-asset-names.ts --apply` deve reclassificar');
    console.log('     os que estão como stock mas têm "imobil"/"fii" no nome.');
  } else if (endsWith11AsStock > endsWith11AsFii) {
    console.log(
      `   ⚠️ Mais "stocks terminando em 11" (${endsWith11AsStock}) que "FIIs" (${endsWith11AsFii}).`,
    );
    console.log('   → Provavelmente backfill nunca rodou. Executar:');
    console.log('     `npx tsx scripts/backfill-asset-names.ts --apply`');
  } else {
    console.log(
      `   ✅ DB parece OK (${fiiCount} FIIs). Bug pode estar no frontend ou em outro lugar.`,
    );
  }
}

main()
  .catch((err) => {
    console.error('❌ Erro:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
