import cron from 'node-cron';
import { runPortfolioSnapshotsJob } from '@/services/portfolioSnapshotPersistence';

/** Após sync de preços (02:00) — persiste patrimônio/TWR diários até ontem. */
const CRON_SCHEDULE = '0 4 * * *';

export const executePortfolioSnapshots = async (): Promise<void> => {
  console.log('🕐 Iniciando job de snapshots de carteira...');
  console.log(`📅 ${new Date().toLocaleString('pt-BR')}`);
  const result = await runPortfolioSnapshotsJob();
  console.log('📊 Resultado:', JSON.stringify(result, null, 2));
  if (result.errors.length > 0) {
    console.warn(`⚠️ ${result.errors.length} usuário(s) com erro`);
  }
};

export const startPortfolioSnapshotsSync = () => {
  console.log(
    '🚀 Cron job: snapshots de carteira (portfolio_daily_snapshots + portfolio_performance)',
  );
  console.log(`⏰ ${CRON_SCHEDULE} — America/Sao_Paulo`);

  if (!cron.validate(CRON_SCHEDULE)) {
    throw new Error(`Cron schedule inválido: ${CRON_SCHEDULE}`);
  }

  const task = cron.schedule(
    CRON_SCHEDULE,
    async () => {
      try {
        await executePortfolioSnapshots();
      } catch (error) {
        console.error('💥 Erro no cron de snapshots de carteira:', error);
      }
    },
    { timezone: 'America/Sao_Paulo' },
  );

  return task;
};

export const runManualPortfolioSnapshots = async (): Promise<void> => {
  await executePortfolioSnapshots();
};
