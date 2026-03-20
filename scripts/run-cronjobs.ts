/**
 * Script para executar os cron jobs manualmente
 * 1. Sincronização de ativos (B3, criptoativos, moedas, preços)
 * 2. Ingestão de índices econômicos (CDI, IPCA)
 */
import { runManualSync } from '../src/jobs/dailySync';
import { runManualIngestion } from '../src/jobs/economicIndexesSync';
import prisma from '../src/lib/prisma';

async function main() {
  try {
    console.log('🚀 Executando cron jobs manualmente...\n');

    console.log('📊 1/2 - Sincronização de ativos');
    await runManualSync();
    console.log('');

    console.log('📈 2/2 - Ingestão de índices econômicos');
    await runManualIngestion();

    console.log('\n✅ Todos os cron jobs executados com sucesso!');
  } catch (error) {
    console.error('\n❌ Erro:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
