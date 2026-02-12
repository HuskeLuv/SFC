import cron from 'node-cron';
import { syncAssets, testSync } from '@/services/brapiSync';
import prisma from '@/lib/prisma';

// ================== CONFIGURATION ==================

// Configuração do cron job - executa todos os dias às 02:00
const CRON_SCHEDULE = '0 2 * * *'; // Formato: minuto hora dia mês dia-da-semana

// Opcional: após fechamento do mercado (18:30 BRT, seg-sex)
// const CRON_AFTER_MARKET = '30 18 * * 1-5';

// ================== SYNC FUNCTIONS ==================

/**
 * Executa a sincronização de ativos
 */
const executeSync = async (): Promise<void> => {
  console.log('🕐 Iniciando sincronização diária de ativos...');
  console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);
  
  try {
    const result = await syncAssets();
    
    // Log do resultado
    console.log('📊 Resultado da sincronização:');
    console.log(`   • Ativos B3: ${result.stocks.inserted} inseridos, ${result.stocks.updated} atualizados, ${result.stocks.errors} erros`);
    console.log(`   • Criptoativos: ${result.crypto.inserted} inseridos, ${result.crypto.updated} atualizados, ${result.crypto.errors} erros`);
    console.log(`   • Preços: ${result.prices.totalInserted} inseridos, ${result.prices.totalUpdated} atualizados, ${result.prices.errors} erros`);
    console.log(`   • Total: ${result.total.inserted} inseridos, ${result.total.updated} atualizados, ${result.total.errors} erros`);
    console.log(`   • Duração: ${result.duration.toFixed(2)}s`);
    
    // Aqui você pode adicionar notificações, logs para banco, etc.
    await logSyncResult();
    
  } catch (error) {
    console.error('💥 Erro durante a sincronização diária:', error);
    
    // Aqui você pode adicionar notificações de erro, logs para banco, etc.
    await logSyncError();
    
    throw error;
  }
};

/**
 * Registra o resultado da sincronização (opcional - para auditoria)
 */
const logSyncResult = async (): Promise<void> => {
  try {
    // Aqui você pode salvar o resultado em uma tabela de logs
    // Por exemplo, criar uma tabela sync_logs se necessário
    console.log('📝 Resultado da sincronização registrado');
  } catch (error) {
    console.error('❌ Erro ao registrar resultado:', error);
  }
};

/**
 * Registra erros da sincronização (opcional - para auditoria)
 */
const logSyncError = async (): Promise<void> => {
  try {
    // Aqui você pode salvar o erro em uma tabela de logs
    console.log('📝 Erro da sincronização registrado');
  } catch (logError) {
    console.error('❌ Erro ao registrar erro:', logError);
  }
};

// ================== CRON JOB SETUP ==================

/**
 * Inicia o cron job para sincronização diária
 */
export const startDailySync = () => {
  console.log('🚀 Iniciando cron job para sincronização diária...');
  console.log(`⏰ Agendado para executar: ${CRON_SCHEDULE} (todos os dias às 02:00)`);
  
  // Validar se o cron schedule é válido
  if (!cron.validate(CRON_SCHEDULE)) {
    throw new Error(`Cron schedule inválido: ${CRON_SCHEDULE}`);
  }
  
  // Configurar o cron job
  const task = cron.schedule(CRON_SCHEDULE, async () => {
    try {
      await executeSync();
    } catch (error) {
      console.error('💥 Erro no cron job:', error);
    }
  }, {
    timezone: 'America/Sao_Paulo' // Timezone do Brasil
  });
  
  console.log('✅ Cron job configurado com sucesso!');
  
  // Retornar a task para controle (opcional)
  return task;
};

/**
 * Para o cron job
 */
export const stopDailySync = (task: { stop: () => void } | null): void => {
  if (task) {
    task.stop();
    console.log('⏹️  Cron job parado');
  }
};

// ================== MANUAL EXECUTION ==================

/**
 * Executa a sincronização manualmente (para testes)
 */
export const runManualSync = async (): Promise<void> => {
  console.log('🔧 Executando sincronização manual...');
  
  try {
    await executeSync();
    console.log('✅ Sincronização manual concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro na sincronização manual:', error);
    throw error;
  }
};

/**
 * Testa a sincronização sem executar
 */
export const testSyncConnection = async (): Promise<boolean> => {
  console.log('🧪 Testando conexão com APIs...');
  
  try {
    const isWorking = await testSync();
    
    if (isWorking) {
      console.log('✅ Teste de conexão passou!');
    } else {
      console.log('❌ Teste de conexão falhou!');
    }
    
    return isWorking;
  } catch (error) {
    console.error('❌ Erro no teste de conexão:', error);
    return false;
  }
};

// ================== GRACEFUL SHUTDOWN ==================

/**
 * Configura o shutdown graceful
 */
export const setupGracefulShutdown = (task: { stop: () => void } | null): void => {
  const shutdown = async () => {
    console.log('🛑 Iniciando shutdown graceful...');
    
    if (task) {
      stopDailySync(task);
    }
    
    await prisma.$disconnect();
    console.log('✅ Shutdown concluído');
    process.exit(0);
  };
  
  // Capturar sinais de shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGUSR2', shutdown); // Para nodemon
  
  console.log('🛡️  Graceful shutdown configurado');
};

// ================== EXPORTS ==================

export {
  CRON_SCHEDULE,
  executeSync
};

