/**
 * Limpa duplicatas em asset_corporate_actions causadas pelo bug de
 * timezone na ingestão (corrigido em dividendService.ts neste mesmo commit).
 *
 * Padrão observado: cada ação aparece duas vezes, uma com timestamp T00:00:00Z
 * (sync rodado em servidor UTC, ex.: Vercel) e outra com T03:00:00Z (sync
 * rodado em servidor BRT, ex.: dev local). Mesma data civil, mesmo symbol,
 * mesmo type, mesmo factor — só timestamp diverge.
 *
 * Estratégia: agrupa por (symbol, type, data civil UTC, factor). Pra cada
 * grupo com >1 entrada, mantém a com hora=0 (canônica UTC) e deleta as
 * outras. Idempotente.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/dedupe-corporate-actions.ts          # dry run
 *   npx tsx --env-file=.env scripts/dedupe-corporate-actions.ts --apply  # persiste
 */
import prisma from '@/lib/prisma';

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`🔧 Dedupe asset_corporate_actions (${apply ? 'APPLY' : 'DRY RUN'})\n`);

  const all = await prisma.assetCorporateAction.findMany({
    orderBy: [{ symbol: 'asc' }, { date: 'asc' }, { type: 'asc' }],
  });

  // Agrupa por (symbol, type, civilDate, factor)
  type Action = (typeof all)[number];
  const groups = new Map<string, Action[]>();
  for (const a of all) {
    const dKey = `${a.date.getUTCFullYear()}-${a.date.getUTCMonth() + 1}-${a.date.getUTCDate()}`;
    const key = `${a.symbol}|${a.type}|${dKey}|${a.factor}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  const duplicates: Action[] = [];
  let canonicalKept = 0;
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    // Prefer a entrada com hora UTC == 0 (canônica). Se nenhuma tem, mantém a
    // mais antiga (menor id por createdAt).
    const sorted = [...group].sort((a, b) => {
      const aIsCanon = a.date.getUTCHours() === 0 ? 0 : 1;
      const bIsCanon = b.date.getUTCHours() === 0 ? 0 : 1;
      if (aIsCanon !== bIsCanon) return aIsCanon - bIsCanon;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const [keep, ...drop] = sorted;
    canonicalKept++;
    duplicates.push(...drop);
    console.log(
      `  ${keep.symbol} ${keep.type} ${keep.date.toISOString().slice(0, 10)} factor=${keep.factor}: keep id=${keep.id.slice(0, 8)} (${keep.date.toISOString()}), drop ${drop.length}`,
    );
  }

  console.log(
    `\n📊 ${groups.size} grupos únicos, ${canonicalKept} com duplicata, ${duplicates.length} entradas a remover\n`,
  );

  if (!apply) {
    console.log('💡 Rode com --apply para deletar.');
    return;
  }
  if (duplicates.length === 0) return;

  const ids = duplicates.map((d) => d.id);
  await prisma.assetCorporateAction.deleteMany({ where: { id: { in: ids } } });
  console.log(`✅ ${duplicates.length} duplicatas removidas.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Erro:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
