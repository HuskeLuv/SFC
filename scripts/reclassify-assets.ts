/**
 * Aplica `classifyByName` em todos os assets BRAPI que JÁ TÊM nome real,
 * pra corrigir reclassificações sem precisar bater na BRAPI de novo.
 *
 * Complementa `backfill-asset-names.ts` (que só pega assets com name === symbol).
 * Use sempre que a heurística em `src/services/pricing/brapiSync.ts` for atualizada
 * e você quiser propagar a mudança pro DB existente.
 *
 * Uso:
 *   npx tsx scripts/reclassify-assets.ts          # dry run
 *   npx tsx scripts/reclassify-assets.ts --apply  # persiste
 */
import prisma from '@/lib/prisma';
import { classifyByName } from '@/services/pricing/brapiSync';

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`🔧 Reclassificação de assets BRAPI (${apply ? 'APPLY' : 'DRY RUN'})\n`);

  // Pega todos os assets BRAPI com nome real (não fallback de symbol).
  const assets = await prisma.asset.findMany({
    where: { source: 'brapi' },
    select: { id: true, symbol: true, name: true, type: true },
  });

  const named = assets.filter((a) => a.name.toUpperCase() !== a.symbol.toUpperCase());
  console.log(`   ${assets.length} assets BRAPI total`);
  console.log(`   ${named.length} com nome real (elegíveis pra reclassificação)\n`);

  const changes: Array<{ symbol: string; oldType: string; newType: string; name: string }> = [];
  for (const asset of named) {
    const newType = classifyByName(asset.name, asset.symbol, asset.type);
    if (newType !== asset.type) {
      changes.push({
        symbol: asset.symbol,
        oldType: asset.type,
        newType,
        name: asset.name.slice(0, 70),
      });
      if (apply) {
        await prisma.asset.update({
          where: { id: asset.id },
          data: { type: newType },
        });
      }
    }
  }

  console.log(`   ${changes.length} reclassificações ${apply ? 'aplicadas' : 'pendentes'}\n`);

  if (changes.length > 0) {
    // Agrupa por (oldType → newType) pra resumir
    const byTransition = new Map<string, number>();
    for (const c of changes) {
      const key = `${c.oldType} → ${c.newType}`;
      byTransition.set(key, (byTransition.get(key) ?? 0) + 1);
    }
    console.log('Resumo por transição:');
    console.table(
      [...byTransition.entries()].map(([transition, count]) => ({ transition, count })),
    );

    console.log('\nAmostra (até 30):');
    console.table(changes.slice(0, 30));
  }

  if (!apply && changes.length > 0) {
    console.log('\n💡 Rode com --apply para persistir.');
  } else if (apply) {
    console.log('\n✅ Persistido.');
  }
}

main()
  .catch((err) => {
    console.error('❌ Erro:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
