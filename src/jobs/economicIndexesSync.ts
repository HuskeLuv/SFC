import cron from 'node-cron';
import {
  runEconomicIndexesIngestion,
  testBacenConnection,
} from '@/services/economicIndexesIngestion';
import prisma from '@/lib/prisma';

// ================== CONFIGURATION ==================

// Configuração do cron job - executa todos os dias às 03:00
const CRON_SCHEDULE = '0 3 * * *'; // Formato: minuto hora dia mês dia-da-semana

// ================== SYNC FUNCTIONS ==================

/**
 * Executa a ingestão de índices econômicos
 */
const executeIngestion = async (): Promise<void> => {
  console.log('🕐 Iniciando ingestão de índices econômicos (CDI e IPCA)...');
  console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);

  try {
    const result = await runEconomicIndexesIngestion();

    // Log do resultado
    console.log('📊 Resultado da ingestão:');
    console.log(
      `   • Total: ${result.inserted} inseridos, ${result.updated} atualizados, ${result.errors} erros`,
    );
    console.log(`   • Duração: ${result.duration.toFixed(2)}s`);

    // Aqui você pode adicionar notificações, logs para banco, etc.
    await logIngestionResult(result);
  } catch (error) {
    console.error('💥 Erro durante a ingestão de índices econômicos:', error);

    // Aqui você pode adicionar notificações de erro, logs para banco, etc.
    await logIngestionError(error);

    throw error;
  }
};

/**
 * Registra o resultado da ingestão (opcional - para auditoria)
 */
const logIngestionResult = async (_result: {
  inserted: number;
  updated: number;
  errors: number;
  duration: number;
}): Promise<void> => {
  try {
    // Aqui você pode salvar o resultado em uma tabela de logs
    // Por exemplo, criar uma tabela ingestion_logs se necessário
    console.log('📝 Resultado da ingestão registrado');
  } catch (error) {
    console.error('❌ Erro ao registrar resultado:', error);
  }
};

/**
 * Registra erros da ingestão (opcional - para auditoria)
 */
const logIngestionError = async (_error: unknown): Promise<void> => {
  try {
    // Aqui você pode salvar o erro em uma tabela de logs
    console.log('📝 Erro da ingestão registrado');
  } catch (logError) {
    console.error('❌ Erro ao registrar erro:', logError);
  }
};

// ================== CRON JOB SETUP ==================

/**
 * Inicia o cron job para ingestão de índices econômicos
 */
export const startEconomicIndexesSync = () => {
  console.log('🚀 Iniciando cron job para ingestão de índices econômicos...');
  console.log(`⏰ Agendado para executar: ${CRON_SCHEDULE} (todos os dias às 03:00)`);

  // Validar se o cron schedule é válido
  if (!cron.validate(CRON_SCHEDULE)) {
    throw new Error(`Cron schedule inválido: ${CRON_SCHEDULE}`);
  }

  // Configurar o cron job
  const task = cron.schedule(
    CRON_SCHEDULE,
    async () => {
      try {
        await executeIngestion();
      } catch (error) {
        console.error('💥 Erro no cron job:', error);
      }
    },
    {
      timezone: 'America/Sao_Paulo', // Timezone do Brasil
    },
  );

  console.log('✅ Cron job de índices econômicos configurado com sucesso!');

  // Retornar a task para controle (opcional)
  return task;
};

/**
 * Para o cron job
 */
export const stopEconomicIndexesSync = (task: { stop: () => void } | null): void => {
  if (task) {
    task.stop();
    console.log('⏹️  Cron job de índices econômicos parado');
  }
};

// ================== MANUAL EXECUTION ==================

/**
 * Executa a ingestão manualmente (para testes)
 */
export const runManualIngestion = async (startDate?: string, endDate?: string): Promise<void> => {
  console.log('🔧 Executando ingestão manual de índices econômicos...');

  try {
    await runEconomicIndexesIngestion(startDate, endDate);
    console.log('✅ Ingestão manual concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro na ingestão manual:', error);
    throw error;
  }
};

/**
 * Testa a conexão com a API do BACEN
 */
export const testBacenConnectionSync = async (): Promise<boolean> => {
  console.log('🧪 Testando conexão com API do BACEN...');

  try {
    const isWorking = await testBacenConnection();

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
    console.log('🛑 Iniciando shutdown graceful (índices econômicos)...');

    if (task) {
      stopEconomicIndexesSync(task);
    }

    await prisma.$disconnect();
    console.log('✅ Shutdown concluído');
    process.exit(0);
  };

  // Capturar sinais de shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGUSR2', shutdown); // Para nodemon

  console.log('🛡️  Graceful shutdown configurado (índices econômicos)');
};

// ================== EXPORTS ==================

export { CRON_SCHEDULE, executeIngestion };
