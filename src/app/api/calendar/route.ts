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
    const userId = payload.id;
    // Defensive ceiling: a single user is unlikely to need >500 calendar
    // events in one payload; cap to keep responses bounded.
    const events = await prisma.event.findMany({ where: { userId }, take: 500 });
    return NextResponse.json(events);
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
});
