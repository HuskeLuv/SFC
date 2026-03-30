import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '@/utils/auth';
import { cashflowIdPatchSchema, validationError } from '@/utils/validation-schemas';
import { withErrorHandler } from '@/utils/apiErrorHandler';

export const GET = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const token = req.cookies.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
      const userId = payload.id;
      const item = await prisma.cashflow.findFirst({ where: { id, userId } });
      if (!item) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
      return NextResponse.json(item);
    } catch {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }
  },
);

export const PATCH = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const token = req.cookies.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
      const userId = payload.id;
      const body = await req.json();
      const parsed = cashflowIdPatchSchema.safeParse(body);
      if (!parsed.success) {
        return validationError(parsed);
      }
      const { data, tipo, categoria, descricao, valor, forma_pagamento, pago } = parsed.data;
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
      if (updated.count === 0)
        return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
      const item = await prisma.cashflow.findUnique({ where: { id } });
      return NextResponse.json(item);
    } catch {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }
  },
);

export const DELETE = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const token = req.cookies.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
      const userId = payload.id;
      const deleted = await prisma.cashflow.deleteMany({ where: { id, userId } });
      if (deleted.count === 0)
        return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
      return NextResponse.json({ success: true });
    } catch {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }
  },
);
