import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  // requireAuthWithActing: consultor atuando por um cliente enxerga a agenda
  // do cliente (auditoria 29/08/2026, achados 1.3/2.2).
  const { targetUserId } = await requireAuthWithActing(req);
  // Defensive ceiling: a single user is unlikely to need >500 calendar
  // events in one payload; cap to keep responses bounded.
  const events = await prisma.event.findMany({ where: { userId: targetUserId }, take: 500 });
  return NextResponse.json(events);
});
