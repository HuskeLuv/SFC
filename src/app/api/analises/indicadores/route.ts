import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { getAllIndicators } from '@/services/marketIndicatorService';

import { withErrorHandler } from '@/utils/apiErrorHandler';
export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAuthWithActing(request);

  const indicators = await getAllIndicators();

  return NextResponse.json({
    indicators: {
      ibov: indicators.ibov,
      dolar: indicators.dolar,
      bitcoin: indicators.bitcoin,
      ethereum: indicators.ethereum,
    },
  });
});
