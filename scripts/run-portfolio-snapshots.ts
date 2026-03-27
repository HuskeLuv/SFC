/**
 * Executa o job de snapshots de patrimônio (pré-cálculo diário).
 * Uso: npm run snapshots:portfolio
 */
import { runPortfolioSnapshotsJob } from '../src/services/portfolioSnapshotPersistence';
import prisma from '../src/lib/prisma';

async function main() {
  try {
    console.log('🚀 Gerando snapshots de carteira...\n');
    const result = await runPortfolioSnapshotsJob();
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
