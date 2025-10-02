#!/usr/bin/env tsx

/**
 * Script para sincronização manual de ativos
 * 
 * Uso:
 *   npm run sync-assets          # Sincronização completa
 *   npm run sync-assets --test   # Apenas testar conexão
 *   npm run sync-assets --stats  # Mostrar estatísticas
 */

import { syncAssets, testSync, getAssetStats } from '../src/services/brapiSync';
import prisma from '../src/lib/prisma';

// ================== MAIN FUNCTION ==================

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const command = args[0];
  
  console.log('🚀 Script de Sincronização de Ativos');
  console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}\n`);
  
  try {
    switch (command) {
      case '--test':
        await runTest();
        break;
        
      case '--stats':
        await showStats();
        break;
        
      case '--help':
        showHelp();
        break;
        
      default:
        await runSync();
        break;
    }
    
  } catch (error) {
    console.error('\n💥 Erro durante a execução:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

// ================== COMMANDS ==================

/**
 * Executa sincronização completa
 */
const runSync = async (): Promise<void> => {
  console.log('🔄 Executando sincronização completa...\n');
  
  const startTime = Date.now();
  
  try {
    const result = await syncAssets();
    
    const endTime = Date.now();
    const totalDuration = (endTime - startTime) / 1000;
    
    console.log('\n🎉 Sincronização concluída!');
    console.log(`⏱️  Tempo total: ${totalDuration.toFixed(2)}s`);
    
  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
    throw error;
  }
};

/**
 * Testa conexão com APIs
 */
const runTest = async (): Promise<void> => {
  console.log('🧪 Testando conexão com APIs...\n');
  
  try {
    const isWorking = await testSync();
    
    if (isWorking) {
      console.log('✅ Teste passou! APIs estão funcionando.');
    } else {
      console.log('❌ Teste falhou! Verifique as APIs.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
    throw error;
  }
};

/**
 * Mostra estatísticas dos ativos
 */
const showStats = async (): Promise<void> => {
  console.log('📊 Estatísticas dos ativos no banco...\n');
  
  try {
    const stats = await getAssetStats();
    
    console.log('📈 Resumo:');
    console.log(`   • Total de ativos: ${stats.total}`);
    console.log('\n📋 Por tipo:');
    
    stats.byType.forEach(group => {
      console.log(`   • ${group.type}: ${group._count.id} ativos (fonte: ${group.source})`);
    });
    
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas:', error);
    throw error;
  }
};

/**
 * Mostra ajuda
 */
const showHelp = (): void => {
  console.log(`
📖 Uso do Script de Sincronização de Ativos

Comandos disponíveis:
  npm run sync-assets          # Sincronização completa
  npm run sync-assets --test   # Apenas testar conexão
  npm run sync-assets --stats  # Mostrar estatísticas
  npm run sync-assets --help   # Mostrar esta ajuda

Exemplos:
  # Sincronizar todos os ativos
  npm run sync-assets
  
  # Testar se as APIs estão funcionando
  npm run sync-assets --test
  
  # Ver quantos ativos temos no banco
  npm run sync-assets --stats

📝 Notas:
  • A sincronização busca dados da API Brapi (brapi.dev)
  • Ativos existentes são atualizados, novos são inseridos
  • O processo é executado automaticamente todos os dias às 02:00
  • Use este script para sincronização manual quando necessário
`);
};

// ================== EXECUTION ==================

// Executar apenas se este arquivo foi chamado diretamente
if (require.main === module) {
  main()
    .catch((error) => {
      console.error('❌ Erro não capturado:', error);
      process.exit(1);
    });
}

export { main as syncAssetsScript };

