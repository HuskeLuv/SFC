import { NextRequest, NextResponse } from 'next/server';
import { syncCatalog } from '@/services/pricing/brapiSync';
import { enqueueUncoveredCatalogSymbols } from '@/services/pricing/marketDataGap';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';

/**
 * Cron: syncs asset catalog (metadata) from BRAPI — stocks, crypto, currencies.
 * No price fetching — that's handled by prices-stocks and prices-other.
 *
 * Ao fim, enfileira pra backfill todo símbolo RV novo que entrou no catálogo, pra
 * que o cron de refresh materialize seus proventos/eventos sem o usuário esbarrar.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);

  const result = await syncCatalog();
  const enqueued = await enqueueUncoveredCatalogSymbols();
  return NextResponse.json({ ...result, marketDataEnqueued: enqueued });
});
