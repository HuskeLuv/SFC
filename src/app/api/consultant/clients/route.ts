import { NextRequest, NextResponse } from 'next/server';
import { getClientsByConsultant } from '@/services/consultantService';
import { authenticateConsultant } from '@/utils/consultantAuth';

import { withErrorHandler } from '@/utils/apiErrorHandler';
const CACHE_CONTROL_HEADER = 's-maxage=300, stale-while-revalidate=60';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const consultant = await authenticateConsultant(request);
  const clients = await getClientsByConsultant(consultant.consultantId);

  return NextResponse.json(
    { clients },
    {
      headers: { 'Cache-Control': CACHE_CONTROL_HEADER },
    },
  );
});
