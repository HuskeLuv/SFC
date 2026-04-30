import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = req.cookies.get('token')?.value;
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    if (payload.role !== 'consultant') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    const userId = payload.id;
    // Defensive ceiling: dashboard payload should stay small; cap to
    // protect against unbounded growth if the data model evolves.
    const data = await prisma.dashboardData.findMany({ where: { userId }, take: 1000 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
});
