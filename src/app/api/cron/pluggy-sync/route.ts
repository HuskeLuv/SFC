import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';
import { pluggyHabilitado } from '@/lib/pluggyConfig';
import { processarEventosPendentes, reconciliarConexoes } from '@/services/pluggy/sync';

/**
 * Cron HTTP: GET com Authorization: Bearer CRON_SECRET
 *
 *  - a cada 5 min:  /api/cron/pluggy-sync           → processa a fila de webhooks
 *  - 1×/dia 08:30:  /api/cron/pluggy-sync?diario=1  → + reconciliação das conexões
 *                                                     sem sync nas últimas 20 h
 * Agendado em /etc/cron.d/myfinance (infra/modules/lightsail/provision.sh.tftpl).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);
  if (!pluggyHabilitado()) {
    return NextResponse.json({ habilitado: false });
  }
  const fila = await processarEventosPendentes(20);
  const diario = request.nextUrl.searchParams.get('diario') === '1';
  const reconciliacao = diario ? await reconciliarConexoes() : null;
  return NextResponse.json({ habilitado: true, fila, reconciliacao });
});
