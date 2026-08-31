import { NextRequest, NextResponse } from 'next/server';
import { syncPricesByScope } from '@/services/pricing/brapiSync';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';

/**
 * Cron: syncs crypto + currency prices from BRAPI.
 * Split from the monolithic brapi-sync to stay within Vercel's 60s limit.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);

  const result = await syncPricesByScope('crypto-currencies');
  return NextResponse.json(result);
});
