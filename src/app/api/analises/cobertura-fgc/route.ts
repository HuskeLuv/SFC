import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { carregarCoberturaFgc } from '@/services/analises/coberturaFgc';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  return NextResponse.json(await carregarCoberturaFgc(targetUserId));
});
