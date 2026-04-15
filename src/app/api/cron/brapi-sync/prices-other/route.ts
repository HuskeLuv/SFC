import { NextRequest, NextResponse } from 'next/server';
import { syncPricesByScope } from '@/services/pricing/brapiSync';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Cron: syncs crypto + currency prices from BRAPI.
 * Split from the monolithic brapi-sync to stay within Vercel's 60s limit.
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

  const result = await syncPricesByScope('crypto-currencies');
  return NextResponse.json(result);
});
