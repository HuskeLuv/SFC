import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  // Dados de dashboard são exclusivos do consultor (mesma regra de antes,
  // agora via helper central — auditoria 29/08/2026, achados 1.3/2.2).
  const payload = requireRole(req, 'consultant');
  // Defensive ceiling: dashboard payload should stay small; cap to
  // protect against unbounded growth if the data model evolves.
  const data = await prisma.dashboardData.findMany({ where: { userId: payload.id }, take: 1000 });
  return NextResponse.json(data);
});
