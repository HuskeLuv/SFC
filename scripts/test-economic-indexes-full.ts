/**
 * Script de teste para ingestão completa de índices econômicos
 * Usa a data padrão (5 anos atrás para CDI)
 */

import { runManualIngestion } from '../src/jobs/economicIndexesSync';

async function main() {
  console.log('🧪 Testando ingestão completa de índices econômicos (data padrão: 5 anos)...\n');
  
  try {
    // Executar sem datas para usar o padrão (5 anos)
    await runManualIngestion();
    
    console.log('\n✅ Teste concluído com sucesso!');
    
  } catch (error) {
    console.error('\n❌ Erro durante o teste:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
