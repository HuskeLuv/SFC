/**
 * Script de teste para ingestão de índices econômicos
 * 
 * Uso:
 *   npm run test-economic-indexes
 *   ou
 *   npx tsx scripts/test-economic-indexes.ts
 */

import { testBacenConnectionSync, runManualIngestion } from '../src/jobs/economicIndexesSync';

async function main() {
  console.log('🧪 Iniciando testes de ingestão de índices econômicos...\n');
  
  try {
    // Teste 1: Conexão com API do BACEN
    console.log('='.repeat(60));
    console.log('TESTE 1: Conexão com API do BACEN');
    console.log('='.repeat(60));
    const connectionTest = await testBacenConnectionSync();
    
    if (!connectionTest) {
      console.error('❌ Teste de conexão falhou. Abortando testes.');
      process.exit(1);
    }
    
    console.log('\n');
    
    // Teste 2: Ingestão com período pequeno (últimos 30 dias)
    console.log('='.repeat(60));
    console.log('TESTE 2: Ingestão de dados (últimos 30 dias)');
    console.log('='.repeat(60));
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    // Formatar data no formato DD/MM/YYYY para a API do BACEN
    const formatDateBR = (date: Date): string => {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };
    
    const startDateStr = formatDateBR(startDate);
    const endDateStr = formatDateBR(endDate);
    
    console.log(`📅 Período: ${startDateStr} a ${endDateStr}\n`);
    
    await runManualIngestion(
      startDateStr,
      endDateStr
    );
    
    console.log('\n');
    console.log('='.repeat(60));
    console.log('✅ Todos os testes concluídos com sucesso!');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Erro durante os testes:', error);
    process.exit(1);
  } finally {
    // Garantir que o processo termine
    process.exit(0);
  }
}

main();
