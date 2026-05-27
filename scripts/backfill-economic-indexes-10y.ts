/**
 * F2.1 (Relatório Definitivo Mai/27): backfill BACEN SGS de 10 anos.
 *
 * Estado antes: CDI/SELIC/IGPM/etc. com ~5 anos de histórico (2021-05 → hoje).
 * IPCA já cobre 16 anos (2010-01). IMAB parou em 2023-05 (regressão tratada em F2.5).
 *
 * Este script chama runEconomicIndexesIngestion com backfill=true, que agora
 * usa BACKFILL_LOOKBACK_YEARS=10. Operação idempotente (upsert).
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/backfill-economic-indexes-10y.ts
 */
import { runEconomicIndexesIngestion } from '@/services/market/economicIndexesIngestion';

async function main() {
  console.log('🔧 F2.1 — backfill BACEN SGS 10 anos\n');
  const result = await runEconomicIndexesIngestion(undefined, undefined, true);
  console.log('\n=== Resultado ===');
  console.log(`Total inseridos: ${result.totalInserted}`);
  console.log(`Total atualizados: ${result.totalUpdated}`);
  console.log(`Total erros: ${result.totalErrors}`);
  console.log('\nDetalhe por série:');
  for (const [k, v] of Object.entries(result.details)) {
    console.log(`  ${k.padEnd(15)} ${v.inserted} ins, ${v.updated} upd, ${v.errors} err`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Erro:', err);
    process.exit(1);
  });
