import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';

interface JWTPayload {
  id: string;
  email: string;
  iat?: number;
  exp?: number;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = req.cookies.get('token')?.value;
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    const userId = payload.id;
    const item = await prisma.cashflow.findFirst({ where: { id, userId } });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ error: 'Invalid token or fetch error' }, { status: 401 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = req.cookies.get('token')?.value;
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    const userId = payload.id;
    const { data, tipo, categoria, descricao, valor, forma_pagamento, pago } = await req.json();
    const updated = await prisma.cashflow.updateMany({
      where: { id, userId },
      data: {
        ...(data && { data: new Date(data) }),
        ...(tipo && { tipo }),
        ...(categoria && { categoria }),
        ...(descricao && { descricao }),
        ...(typeof valor === 'number' && { valor }),
        ...(forma_pagamento && { forma_pagamento }),
        ...(typeof pago === 'boolean' && { pago }),
      },
    });
    if (updated.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const item = await prisma.cashflow.findUnique({ where: { id } });
    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ error: 'Invalid token or update error' }, { status: 401 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = req.cookies.get('token')?.value;
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    const userId = payload.id;
    const deleted = await prisma.cashflow.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid token or delete error' }, { status: 401 });
  }
} 