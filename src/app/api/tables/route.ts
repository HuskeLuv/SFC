import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('token')?.value;
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!);
    const userId = (payload as any).id;
    const tables = await prisma.tableData.findMany({ where: { userId } });
    return NextResponse.json(tables);
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('token')?.value;
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!);
    const userId = (payload as any).id;
    const { label, month, value } = await req.json();
    if (!label || !month || typeof value !== 'number') {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    const table = await prisma.tableData.create({
      data: { userId, label, month, value },
    });
    return NextResponse.json(table);
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
} 