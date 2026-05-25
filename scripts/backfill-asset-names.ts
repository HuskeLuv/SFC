/**
 * Bug #07 (relatório Maio/2026, segundo passe): backfill de nomes dos assets
 * que entraram com `name === symbol` (fallback do `/api/quote/list` da BRAPI
 * quando o nome longo não vem). Também reclassifica `type` quando o nome real
 * indica claramente FII ou unit de ação (ENGI11, BPAC11, SANB11 etc. estavam
 * marcadas como `type='fii'` por causa da heurística `endsWith('11')`).
 *
 * Uso:
 *   npx tsx scripts/backfill-asset-names.ts          # dry run (default)
 *   npx tsx scripts/backfill-asset-names.ts --apply  # persiste mudanças
 *
 * Idempotente: rodar de novo só atualiza o que ainda diverge.
 */
import { fetchDetailedQuotes } from '@/services/pricing/brapiQuote';
import prisma from '@/lib/prisma';

// Mantém sincronizado com src/services/pricing/brapiSync.ts → classifyByName
const classifyByName = (name: string, symbol: string, currentType: string): string => {
  const lowerName = name.toLowerCase();
  const lowerSymbol = symbol.toLowerCase();
  const nameNoSpaces = lowerName.replace(/\s+/g, '');

  if (nameNoSpaces.includes('imobil') || /\bfii\b/.test(lowerName)) return 'fii';
  if (/\bunits?\b/.test(lowerName)) return 'stock';
  if (
    /\betf\b/.test(lowerName) ||
    lowerName.includes('ishares') ||
    /\bfundo de [ií]ndice\b/.test(lowerName)
  ) {
    return 'etf';
  }
  if (/\breit\b/.test(lowerName)) return 'reit';
  if (lowerSymbol.endsWith('34')) return 'bdr';

  return currentType;
};

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`🔧 Backfill de nomes/tipos (${apply ? 'APPLY' : 'DRY RUN'})\n`);

  // Pega todos os assets BRAPI que (a) têm name === symbol OU (b) potencialmente
  // mis-classificados como FII por endsWith('11'). Filtramos no source pra
  // evitar tocar em assets manuais, CVM, Tesouro etc.
  const candidates = await prisma.asset.findMany({
    where: { source: 'brapi' },
    select: { id: true, symbol: true, name: true, type: true },
  });

  const needsBackfill = candidates.filter(
    (a) =>
      a.name.toUpperCase() === a.symbol.toUpperCase() ||
      (a.type === 'fii' && a.symbol.endsWith('11')),
  );

  console.log(`   ${candidates.length} assets BRAPI total`);
  console.log(`   ${needsBackfill.length} candidatos para backfill\n`);

  if (needsBackfill.length === 0) {
    console.log('Nada a fazer.');
    return;
  }

  const BATCH_SIZE = 20;
  const updates: Array<{
    symbol: string;
    oldName: string;
    newName: string | null;
    oldType: string;
    newType: string | null;
  }> = [];
  let nameOnlyCount = 0;
  let typeChangedCount = 0;
  let notFoundCount = 0;

  for (let i = 0; i < needsBackfill.length; i += BATCH_SIZE) {
    const batch = needsBackfill.slice(i, i + BATCH_SIZE);
    const symbols = batch.map((a) => a.symbol);

    let detailed: Awaited<ReturnType<typeof fetchDetailedQuotes>>;
    try {
      detailed = await fetchDetailedQuotes(symbols);
    } catch (err) {
      console.warn(`   ⚠️ Erro no batch ${i}-${i + BATCH_SIZE}:`, (err as Error).message);
      continue;
    }

    const detailedBySymbol = new Map(detailed.map((d) => [d.symbol.toUpperCase(), d]));

    for (const asset of batch) {
      const symbolUpper = asset.symbol.toUpperCase();
      const detail = detailedBySymbol.get(symbolUpper);

      if (!detail) {
        notFoundCount++;
        continue;
      }

      const rawName = detail.longName || detail.shortName || '';
      const newName =
        rawName.trim().length > 0 && rawName.trim().toUpperCase() !== symbolUpper
          ? rawName.trim()
          : null;
      const newType = newName ? classifyByName(newName, asset.symbol, asset.type) : null;

      const nameChanges = newName && newName !== asset.name;
      const typeChanges = newType && newType !== asset.type;

      if (!nameChanges && !typeChanges) continue;

      updates.push({
        symbol: asset.symbol,
        oldName: asset.name,
        newName: nameChanges ? newName : null,
        oldType: asset.type,
        newType: typeChanges ? newType : null,
      });

      if (typeChanges) typeChangedCount++;
      else if (nameChanges) nameOnlyCount++;

      if (apply) {
        await prisma.asset.update({
          where: { id: asset.id },
          data: {
            ...(nameChanges ? { name: newName! } : {}),
            ...(typeChanges ? { type: newType! } : {}),
          },
        });
      }
    }

    process.stdout.write(
      `\r   processado ${Math.min(i + BATCH_SIZE, needsBackfill.length)}/${needsBackfill.length}`,
    );
  }

  console.log('\n');
  console.log(`   ${nameOnlyCount} apenas nome atualizado`);
  console.log(`   ${typeChangedCount} tipo reclassificado`);
  console.log(`   ${notFoundCount} não encontrados na BRAPI (mantidos)`);

  // Mostra amostra dos tipos reclassificados (mais interessante p/ revisão)
  const reclassified = updates.filter((u) => u.newType);
  if (reclassified.length > 0) {
    console.log(`\nAmostra de reclassificações (até 20):`);
    console.table(
      reclassified.slice(0, 20).map((u) => ({
        symbol: u.symbol,
        oldType: u.oldType,
        newType: u.newType,
        name: (u.newName ?? u.oldName).slice(0, 60),
      })),
    );
  }

  if (!apply) {
    console.log('\n💡 Rode com --apply para persistir as mudanças.');
  } else {
    console.log('\n✅ Mudanças persistidas.');
  }
}

main()
  .catch((err) => {
    console.error('❌ Erro:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
