/**
 * Arquivo de inicialização do cron job
 * 
 * Este arquivo deve ser importado no início da aplicação para iniciar
 * o cron job de sincronização diária de ativos.
 */

import { startDailySync, setupGracefulShutdown } from './dailySync';

// ================== CRON JOB INITIALIZATION ==================

let cronTask: any = null;

/**
 * Inicia o cron job de sincronização
 */
export const initializeCronJob = (): void => {
  try {
    console.log('🚀 Inicializando cron job de sincronização de ativos...');
    
    // Iniciar o cron job
    cronTask = startDailySync();
    
    // Configurar shutdown graceful
    setupGracefulShutdown(cronTask);
    
    console.log('✅ Cron job inicializado com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao inicializar cron job:', error);
    throw error;
  }
};

/**
 * Para o cron job
 */
export const stopCronJob = (): void => {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    console.log('⏹️  Cron job parado');
  }
};

/**
 * Verifica se o cron job está ativo
 */
export const isCronJobActive = (): boolean => {
  return cronTask !== null;
};

// ================== AUTO-INITIALIZATION ==================

// Inicializar automaticamente se este arquivo for importado
// (remover se você quiser controlar manualmente)
if (process.env.NODE_ENV === 'production') {
  initializeCronJob();
}

