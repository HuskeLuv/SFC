import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

import { runTesouroDiretoSync } from '@/services/pricing/tesouroDiretoSync';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';

/**
 * Cron HTTP: GET com Authorization: Bearer CRON_SECRET
 *
 * Baixa preços diários de títulos do Tesouro Direto do portal
 * Tesouro Transparente (CSV ~13MB) e persiste na tabela TesouroDiretoPrice.
 * Também atualiza Asset.currentPrice para ativos vinculados.
 *
 * Agendado em vercel.json (06:15 UTC).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);

  try {
    const result = await runTesouroDiretoSync();
    return NextResponse.json(result);
  } catch (error) {
    logger.error('[cron/tesouro-direto-sync]', error);
    return NextResponse.json(
      { error: 'Falha ao sincronizar dados do Tesouro Direto' },
      { status: 500 },
    );
  }
});
