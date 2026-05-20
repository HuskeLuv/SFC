/**
 * LC 224/2025: a partir de 01/01/2026 a alíquota de IRRF sobre JCP subiu de
 * 15% para 17,5%. `PortfolioProvento` materializados pelo
 * `ensurePortfolioProventosFromMarket` antes do fix de Mai/2026 calcularam o
 * `impostoRenda` a 15% mesmo para `dataPagamento >= 2026-01-01`.
 *
 * Critério seguro (não toca dados editados manualmente):
 *   1. tipo é JCP (variações cobertas por isJcpType)
 *   2. dataPagamento >= 2026-01-01
 *   3. impostoRenda atual === Math.round(valorTotal * 0.15 * 100) / 100
 *      (i.e. exatamente o valor que o helper teria gravado a 15%)
 *
 * Idempotente: a segunda execução não encontra mais valores no padrão antigo.
 *
 * Uso:
 *   npx tsx scripts/backfill-jcp-irrf-lc224.ts          # dry run
 *   npx tsx scripts/backfill-jcp-irrf-lc224.ts --apply  # persiste
 */
import prisma from '@/lib/prisma';
import { isJcpType } from '@/services/pricing/dividendService';

const LC224_EFFECTIVE = new Date(Date.UTC(2026, 0, 1));

const cents = (v: number): number => Math.round(v * 100) / 100;

async function main() {
  const apply = process.argv.includes('--apply');
  if (!apply) {
    console.log('🔍 DRY RUN — execute com --apply para persistir.\n');
  }

  const candidates = await prisma.portfolioProvento.findMany({
    where: {
      dataPagamento: { gte: LC224_EFFECTIVE },
      impostoRenda: { not: null },
    },
    include: { portfolio: { include: { asset: { select: { symbol: true } } } } },
  });

  const jcps = candidates.filter((p) => isJcpType(p.tipo));
  console.log(
    `📊 ${candidates.length} PortfolioProvento(s) >= 2026-01-01 com IR; ${jcps.length} são JCP\n`,
  );

  let fixed = 0;
  let skippedManual = 0;

  for (const p of jcps) {
    const expectedOld = cents(p.valorTotal * 0.15);
    const expectedNew = cents(p.valorTotal * 0.175);

    if (p.impostoRenda !== expectedOld) {
      skippedManual += 1;
      continue;
    }
    if (p.impostoRenda === expectedNew) {
      // já está correto
      continue;
    }

    const symbol = p.portfolio.asset?.symbol ?? '?';
    console.log(
      `  ✓ ${symbol} ${p.tipo} ${p.dataPagamento.toISOString().slice(0, 10)} ` +
        `valor=${p.valorTotal.toFixed(2)} — IR ${p.impostoRenda.toFixed(2)} → ${expectedNew.toFixed(2)}`,
    );

    if (apply) {
      await prisma.portfolioProvento.update({
        where: { id: p.id },
        data: { impostoRenda: expectedNew },
      });
    }
    fixed += 1;
  }

  console.log(`\nResumo:`);
  console.log(`  JCPs >= 01/01/2026:          ${jcps.length}`);
  console.log(`  Recalculados (15%→17,5%):    ${fixed}`);
  console.log(`  Skipped (IR != 15% padrão):  ${skippedManual}`);
  if (!apply && fixed > 0) {
    console.log(`\n👉 Rode novamente com --apply para persistir.`);
  }
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
