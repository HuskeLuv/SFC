/**
 * Sprint 6 (limpeza) — Backfill de `AssetDividendHistory.dataCom`.
 *
 * Após a migration `20260511100000_add_data_com_to_dividend_history` (bug #01),
 * a coluna `dataCom` foi adicionada vazia. O preenchimento natural é lazy:
 * cada chamada de `getDividends(symbol)` que cai no fallback BRAPI repopula
 * o cache com `dataCom` correto. Este script força o backfill para todos os
 * símbolos de ações/FIIs presentes em algum Portfolio.
 *
 * Uso:
 *   npx tsx scripts/backfill-dividend-datacom.ts
 *
 * Estratégia:
 *   1. Para cada símbolo (Asset.type IN ['stock','fii']), DELETA o cache em
 *      `AssetDividendHistory` (forçando a próxima chamada a buscar da BRAPI).
 *   2. Chama `getDividends(symbol, { useBrapiFallback: true })` — que re-popula
 *      a tabela com `dataCom` extraído de `exDate`/`exDividendDate`/`recordDate`.
 *
 * Idempotente: rodar múltiplas vezes só refaz o fetch (sem efeito colateral).
 */
import prisma from '../src/lib/prisma';
import { getDividends } from '../src/services/pricing/dividendService';

async function main() {
  const assets = await prisma.asset.findMany({
    where: { type: { in: ['stock', 'fii'] } },
    select: { symbol: true },
    distinct: ['symbol'],
  });

  console.log(`📊 ${assets.length} símbolos (stock + fii) — iniciando backfill de dataCom...\n`);

  let withDataComBefore = 0;
  let processed = 0;
  let withDataComAfter = 0;
  let withoutData = 0;

  for (const { symbol } of assets) {
    const before = await prisma.assetDividendHistory.count({
      where: { symbol, dataCom: { not: null } },
    });
    withDataComBefore += before;

    // Apaga cache pra forçar fetch BRAPI (que agora popula dataCom).
    await prisma.assetDividendHistory.deleteMany({ where: { symbol } });

    try {
      const dividends = await getDividends(symbol, { useBrapiFallback: true });
      if (dividends.length === 0) {
        withoutData += 1;
      } else {
        const after = await prisma.assetDividendHistory.count({
          where: { symbol, dataCom: { not: null } },
        });
        withDataComAfter += after;
        if (after > 0) {
          console.log(`  ✓ ${symbol} — ${dividends.length} dividendos, ${after} com dataCom`);
        }
      }
    } catch (err) {
      console.warn(`  ⚠️  ${symbol} — fetch falhou: ${(err as Error).message}`);
    }
    processed += 1;
  }

  console.log(`\nResumo:`);
  console.log(`  Símbolos processados:        ${processed}`);
  console.log(`  Sem dividendos na BRAPI:     ${withoutData}`);
  console.log(`  Rows com dataCom (antes):    ${withDataComBefore}`);
  console.log(`  Rows com dataCom (depois):   ${withDataComAfter}`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('❌ Erro:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

export default main;
