import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

import { runCvmFundSync } from '@/services/pricing/cvmFundSync';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Cron HTTP: GET com Authorization: Bearer CRON_SECRET
 *
 * Backfill PROFUNDO de cotas de fundos: baixa os últimos 18 meses de INF_DIARIO
 * da CVM e persiste, pra dar corpo aos gráficos de histórico dos fundos. O
 * cvm-fund-sync diário cobre só os 2 meses recentes (cotas com atraso); este
 * roda semanalmente pra estender o histórico. Apenas fundos detidos por usuários
 * (com CNPJ em ativos) são sincronizados.
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

  try {
    const result = await runCvmFundSync({ monthsBack: 18 });
    return NextResponse.json(result);
  } catch (error) {
    logger.error('[cron/cvm-fund-history]', error);
    return NextResponse.json(
      { error: 'Falha no backfill de histórico de cotas CVM' },
      { status: 500 },
    );
  }
});
