import { NextRequest, NextResponse } from 'next/server';
import { getConsultantOverview } from '@/services/consultantService';
import { authenticateConsultant } from '@/utils/consultantAuth';

import { withErrorHandler } from '@/utils/apiErrorHandler';
const CACHE_CONTROL_HEADER = 'private, no-cache, no-store, must-revalidate';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const consultant = await authenticateConsultant(request);
  const overview = await getConsultantOverview(consultant.consultantId);

  return NextResponse.json(
    { overview },
    {
      headers: { 'Cache-Control': CACHE_CONTROL_HEADER },
    },
  );
});
