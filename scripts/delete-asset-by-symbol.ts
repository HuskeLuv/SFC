/**
 * Remove um ativo do catálogo (`Asset`) pelo symbol, junto com seus dados de
 * mercado derivados (dividendos, eventos corporativos, cobertura). RECUSA apagar
 * se o ativo estiver em alguma carteira ou transação (não é lixo nesse caso).
 *
 * Uso: tsx --env-file=.env scripts/delete-asset-by-symbol.ts "<symbol>"
 */
import { prisma } from '@/lib/prisma';

async function main() {
  const symbol = process.argv[2];
  if (!symbol) throw new Error('passe o symbol: scripts/delete-asset-by-symbol.ts "<symbol>"');

  const asset = await prisma.asset.findUnique({
    where: { symbol },
    select: { id: true, name: true, source: true },
  });
  if (!asset) {
    console.log(`(${symbol} não existe — nada a fazer)`);
    return;
  }

  const [inPort, inTx] = await Promise.all([
    prisma.portfolio.count({ where: { assetId: asset.id } }),
    prisma.stockTransaction.count({ where: { assetId: asset.id } }),
  ]);
  if (inPort > 0 || inTx > 0) {
    console.error(
      `RECUSADO: ${symbol} está em ${inPort} carteira(s) e ${inTx} transação(ões) — NÃO é lixo.`,
    );
    process.exit(1);
  }

  const [d, c, cov] = await Promise.all([
    prisma.assetDividendHistory.deleteMany({ where: { symbol } }),
    prisma.assetCorporateAction.deleteMany({ where: { symbol } }),
    prisma.marketDataCoverage.deleteMany({ where: { symbol } }),
  ]);
  await prisma.assetPriceHistory.deleteMany({ where: { symbol } });
  await prisma.asset.delete({ where: { id: asset.id } });

  console.log(`✅ deletado: ${symbol} ("${asset.name}", source=${asset.source})`);
  console.log(`   removidos: ${d.count} div, ${c.count} eventos, ${cov.count} cobertura`);
}

main()
  .catch((e) => {
    console.error('Fatal:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
