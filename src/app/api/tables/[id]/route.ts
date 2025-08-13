import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.cookies.get('token')?.value;
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!);
    const userId = (payload as any).id;
    const { label, month, value } = await req.json();
    const updated = await prisma.tableData.updateMany({
      where: { id: params.id, userId },
      data: { label, month, value },
    });
    if (updated.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const row = await prisma.tableData.findUnique({ where: { id: params.id } });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: 'Invalid token or update error' }, { status: 401 });
  }
} 