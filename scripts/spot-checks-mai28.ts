/**
 * Spot-checks de validação dos commits 2026-05-27 e 2026-05-28.
 * Não destrutivo — apenas consultas. Item 9 do checklist-validacao-mai27-28.md.
 */
import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('=== F1.1: ITUB4 bonificação falsa 2025-03-17 ===');
  const itub4Falsa = await prisma.assetCorporateAction.findMany({
    where: { symbol: 'ITUB4', date: new Date('2025-03-17') },
  });
  console.log(`Linhas: ${itub4Falsa.length} (esperado: 0)`);
  if (itub4Falsa.length > 0) console.log(itub4Falsa);

  console.log('\n=== #07: Assets com name=symbol (brapi, não crypto/currency) ===');
  const rows07 = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint as count
    FROM assets
    WHERE source = 'brapi'
      AND name = symbol
      AND type NOT IN ('crypto', 'currency')
  `;
  console.log(`Count: ${rows07[0].count} (esperado: <50)`);

  console.log('\n=== F2.2: COTAHIST por ano ===');
  const rowsCotahist = await prisma.$queryRaw<Array<{ ano: number; count: bigint }>>`
    SELECT EXTRACT(YEAR FROM date)::int AS ano, COUNT(*)::bigint AS count
    FROM asset_price_history
    WHERE source = 'B3_COTAHIST'
    GROUP BY ano
    ORDER BY ano
  `;
  rowsCotahist.forEach((r) => console.log(`  ${r.ano}: ${r.count}`));

  console.log('\n=== F2.3: Yahoo Finance count ===');
  const rowsYahoo = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint as count FROM asset_price_history WHERE source = 'YAHOO_FINANCE'
  `;
  console.log(`Count: ${rowsYahoo[0].count} (esperado: ~5085)`);

  console.log('\n=== F2.4: CoinGecko distinct assets ===');
  const rowsCg = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT "assetId")::bigint as count FROM asset_price_history WHERE source = 'COINGECKO'
  `;
  console.log(`Count: ${rowsCg[0].count} (esperado: 10)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
