/**
 * Script para executar os cron jobs manualmente
 * 1. Sincronização de ativos (B3, criptoativos, moedas, preços)
 * 2. Ingestão de índices econômicos (CDI, IPCA)
 *
 * Em produção, estes jobs rodam via Vercel Crons (ver vercel.json).
 * Este script existe para execução local e em shells administrativas.
 */
import { syncAssets } from '../src/services/pricing/brapiSync';
import { runEconomicIndexesIngestion } from '../src/services/market/economicIndexesIngestion';
import prisma from '../src/lib/prisma';

async function main() {
  try {
    console.log('🚀 Executando cron jobs manualmente...\n');

    console.log('📊 1/2 - Sincronização de ativos (B3, criptos, moedas, preços)');
    const syncResult = await syncAssets();
    console.log(
      `   • Total: ${syncResult.total.inserted} inseridos, ${syncResult.total.updated} atualizados, ${syncResult.total.errors} erros`,
    );
    console.log(`   • Duração: ${syncResult.duration.toFixed(2)}s\n`);

    console.log('📈 2/2 - Ingestão de índices econômicos (CDI, IPCA)');
    const ingestResult = await runEconomicIndexesIngestion();
    console.log(
      `   • Total: ${ingestResult.inserted} inseridos, ${ingestResult.updated} atualizados, ${ingestResult.errors} erros`,
    );
    console.log(`   • Duração: ${ingestResult.duration.toFixed(2)}s`);

    console.log('\n✅ Todos os cron jobs executados com sucesso!');
  } catch (error) {
    console.error('\n❌ Erro:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
