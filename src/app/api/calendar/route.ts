import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';

interface JWTPayload {
  id: string;
  email: string;
  iat?: number;
  exp?: number;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('token')?.value;
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    const userId = payload.id;
    const events = await prisma.event.findMany({ where: { userId } });
    return NextResponse.json(events);
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
} 