import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { runAgendaLembretesJob } from '@/services/calendario/lembretes';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';

/**
 * Cron diário (11:00 UTC = 08:00 BRT): notifica o que vence amanhã (parcela,
 * título de renda fixa, prazo de IR, compromisso marcado com lembrete) e o
 * provento que cai hoje. Idempotente — o dedup por (usuário, evento, data)
 * deixa rodar de novo sem duplicar.
 * GET com Authorization: Bearer CRON_SECRET.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);

  try {
    const result = await runAgendaLembretesJob(new Date());
    return NextResponse.json(result);
  } catch (error) {
    logger.error('[cron/calendario-lembretes]', error);
    return NextResponse.json({ error: 'Falha ao executar job' }, { status: 500 });
  }
});
