import { NextRequest, NextResponse } from 'next/server';
import { syncCatalog } from '@/services/pricing/brapiSync';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Cron: syncs asset catalog (metadata) from BRAPI — stocks, crypto, currencies.
 * No price fetching — that's handled by prices-stocks and prices-other.
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

  const result = await syncCatalog();
  return NextResponse.json(result);
});
