import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

import { runCvmCatalogSync } from '@/services/pricing/cvmFundSync';
import { enqueueUncoveredCatalogSymbols } from '@/services/pricing/marketDataGap';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Cron HTTP: GET com Authorization: Bearer CRON_SECRET
 *
 * Baixa o cadastro completo de fundos CVM (registro_fundo_classe.zip — RCVM 175,
 * ~33k fundos em funcionamento normal incluindo FIDC/FIP/Fiagro/FIIM fechados)
 * e cria/atualiza registros na tabela Asset para busca no wizard.
 *
 * Agendado em vercel.json (semanalmente, domingo 05:00 UTC).
 * Pode ser chamado manualmente para a carga inicial.
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
    const result = await runCvmCatalogSync();
    const enqueued = await enqueueUncoveredCatalogSymbols();
    return NextResponse.json({ ...result, marketDataEnqueued: enqueued });
  } catch (error) {
    logger.error('[cron/cvm-catalog-sync]', error);
    return NextResponse.json(
      { error: 'Falha ao sincronizar catálogo CVM de fundos' },
      { status: 500 },
    );
  }
});
