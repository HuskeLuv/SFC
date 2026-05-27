/**
 * Bug #07 (relatório Maio/2026, 2º passe): cron BRAPI ocasionalmente devolve
 * longName vazio pra alguns ativos no batch — quando isso acontece, o asset
 * fica com `name=symbol` e o classifier cai no `currentType` (default 'stock').
 * Tickers de FII (sufixo 11) ficam mal-classificados, a aba FII some pro
 * usuário e os filtros `Asset.type='fii'` perdem o ativo.
 *
 * Investigação: rodando `fetchDetailedQuotes` manualmente pros mesmos tickers
 * AGORA a BRAPI devolve longName perfeito ("Patria Log - Fundo de Investimento
 * Imobiliario..."). O problema é intermitente, não estrutural.
 *
 * Estratégia: pega TODOS os assets source='brapi' com `name=symbol`,
 * chama fetchDetailedQuotes em batches, e quando vem longName aplica
 * classifyByName pra ajustar o type. Idempotente — pode rodar sempre que
 * o catálogo regredir.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/backfill-asset-names-fii.ts          # dry run
 *   npx tsx --env-file=.env scripts/backfill-asset-names-fii.ts --apply  # persiste
 */
import prisma from '@/lib/prisma';
import { fetchDetailedQuotes } from '@/services/pricing/brapiQuote';
import { classifyByName } from '@/services/pricing/brapiSync';

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 200;

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`🔧 Backfill nomes/types BRAPI (${apply ? 'APPLY' : 'DRY RUN'})\n`);

  // Exclui crypto/currency: BRAPI confunde tickers de criptomoeda com ETFs
  // que carregam o mesmo símbolo no nome (ex.: XRP → "Bitwise XRP ETF").
  const candidates = await prisma.$queryRaw<
    Array<{ id: string; symbol: string; name: string; type: string }>
  >`
    SELECT id, symbol, name, type
    FROM assets
    WHERE source = 'brapi'
      AND name = symbol
      AND symbol ~ '^[A-Z]+[0-9]*$'
      AND type NOT IN ('crypto', 'currency')
    ORDER BY symbol
  `;
  console.log(`Encontrados ${candidates.length} ativos com name=symbol\n`);

  if (candidates.length === 0) return;

  let nameUpdated = 0;
  let typeChanged = 0;
  let noLongName = 0;
  let errors = 0;
  const typeMigrations: Record<string, number> = {};

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const symbols = batch.map((a) => a.symbol);
    try {
      const results = await fetchDetailedQuotes(symbols);
      const resultBySymbol = new Map(results.map((r) => [r.symbol.toUpperCase(), r]));

      for (const asset of batch) {
        const r = resultBySymbol.get(asset.symbol.toUpperCase());
        const longName = r?.longName?.trim();
        if (!longName || longName.toUpperCase() === asset.symbol.toUpperCase()) {
          noLongName++;
          continue;
        }
        const newType = classifyByName(longName, asset.symbol, asset.type);
        const willChangeType = newType !== asset.type;
        if (willChangeType) {
          const key = `${asset.type} → ${newType}`;
          typeMigrations[key] = (typeMigrations[key] || 0) + 1;
          typeChanged++;
        }
        nameUpdated++;
        if (apply) {
          await prisma.asset.update({
            where: { id: asset.id },
            data: {
              name: longName,
              ...(willChangeType ? { type: newType } : {}),
            },
          });
        } else {
          if (willChangeType) {
            console.log(
              `  [DRY] ${asset.symbol}: ${asset.type} → ${newType} | "${longName.slice(0, 60)}"`,
            );
          }
        }
      }
    } catch (err) {
      console.error(`  ⚠️  Erro no batch ${i}-${i + BATCH_SIZE}:`, err);
      errors += batch.length;
    }
    if (i + BATCH_SIZE < candidates.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
    if ((i / BATCH_SIZE) % 5 === 0) {
      process.stdout.write(
        `  Progresso: ${Math.min(i + BATCH_SIZE, candidates.length)}/${candidates.length}\r`,
      );
    }
  }

  console.log('\n\n📊 Resultado:');
  console.log(`   • ${nameUpdated} nomes atualizados`);
  console.log(`   • ${typeChanged} types reclassificados`);
  console.log(`   • ${noLongName} sem longName na BRAPI (mantidos)`);
  console.log(`   • ${errors} erros de batch`);
  if (Object.keys(typeMigrations).length > 0) {
    console.log('\n   Migrações de type:');
    for (const [k, v] of Object.entries(typeMigrations).sort((a, b) => b[1] - a[1])) {
      console.log(`     ${k}: ${v}`);
    }
  }

  if (!apply) {
    console.log('\n💡 Rode com --apply para persistir.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Erro:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
