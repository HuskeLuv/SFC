import { syncAssets } from '../src/services/pricing/brapiSync';
import prisma from '../src/lib/prisma';

/**
 * Script para sincronizar ações e ativos da B3
 * Busca dados da API brapi.dev e atualiza o banco de dados
 */
async function main() {
  try {
    console.log('🚀 Iniciando sincronização de ações...\n');

    const result = await syncAssets();

    console.log('\n✅ Sincronização concluída!');
    console.log(
      `📊 Total: ${result.total.inserted} inseridos, ${result.total.updated} atualizados, ${result.total.errors} erros`,
    );
    console.log(`⏱️  Tempo total: ${result.duration.toFixed(2)}s\n`);
  } catch (error) {
    console.error('\n❌ Erro durante a sincronização:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

export default main;
