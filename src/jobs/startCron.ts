/**
 * Arquivo de inicialização dos cron jobs
 * 
 * Este arquivo deve ser importado no início da aplicação para iniciar
 * os cron jobs de sincronização diária de ativos e índices econômicos.
 */

import { startDailySync, setupGracefulShutdown as setupDailySyncShutdown } from './dailySync';
import { startEconomicIndexesSync, setupGracefulShutdown as setupEconomicIndexesShutdown } from './economicIndexesSync';

// ================== CRON JOB INITIALIZATION ==================

let dailySyncTask: { stop: () => void } | null = null;
let economicIndexesTask: { stop: () => void } | null = null;

/**
 * Inicia todos os cron jobs
 */
export const initializeCronJob = (): void => {
  try {
    console.log('🚀 Inicializando cron jobs...');
    
    // Iniciar o cron job de sincronização de ativos
    console.log('📊 Iniciando cron job de sincronização de ativos...');
    dailySyncTask = startDailySync();
    setupDailySyncShutdown(dailySyncTask);
    
    // Iniciar o cron job de ingestão de índices econômicos
    console.log('📈 Iniciando cron job de ingestão de índices econômicos...');
    economicIndexesTask = startEconomicIndexesSync();
    setupEconomicIndexesShutdown(economicIndexesTask);
    
    console.log('✅ Todos os cron jobs inicializados com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao inicializar cron jobs:', error);
    throw error;
  }
};

/**
 * Para todos os cron jobs
 */
export const stopCronJob = (): void => {
  if (dailySyncTask) {
    dailySyncTask.stop();
    dailySyncTask = null;
    console.log('⏹️  Cron job de sincronização de ativos parado');
  }
  
  if (economicIndexesTask) {
    economicIndexesTask.stop();
    economicIndexesTask = null;
    console.log('⏹️  Cron job de índices econômicos parado');
  }
};

/**
 * Verifica se os cron jobs estão ativos
 */
export const isCronJobActive = (): boolean => {
  return dailySyncTask !== null || economicIndexesTask !== null;
};

// ================== AUTO-INITIALIZATION ==================

// Inicializar automaticamente se este arquivo for importado
// (remover se você quiser controlar manualmente)
if (process.env.NODE_ENV === 'production') {
  initializeCronJob();
}

