import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { runPortfolioSnapshotsJob } from '@/services/portfolio/portfolioSnapshotPersistence';

import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';
/**
 * Cron HTTP (ex.: Vercel): GET com Authorization: Bearer CRON_SECRET
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);

  try {
    const result = await runPortfolioSnapshotsJob();
    return NextResponse.json(result);
  } catch (error) {
    logger.error('[cron/portfolio-snapshots]', error);
    return NextResponse.json({ error: 'Falha ao executar job' }, { status: 500 });
  }
});
