import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { runCashflowEvolucaoSnapshotJob } from '@/services/cashflow/evolucaoPatrimonioServer';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Cron diário (18:30 BRT): trava a Evolução do Patrimônio do mês corrente
 * quando hoje é o último dia útil B3 do mês; nos demais dias faz skip.
 * GET com Authorization: Bearer CRON_SECRET. `?force=1` ignora a checagem
 * de data (reprocesso manual).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 503 });
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get('force') === '1';

  try {
    const result = await runCashflowEvolucaoSnapshotJob(new Date(), force);
    return NextResponse.json(result);
  } catch (error) {
    logger.error('[cron/cashflow-evolucao-snapshot]', error);
    return NextResponse.json({ error: 'Falha ao executar job' }, { status: 500 });
  }
});
