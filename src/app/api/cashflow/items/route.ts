import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Token não fornecido' }, { status: 401 });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; email: string };
    const { groupId, descricao, significado } = await request.json();

    // Validate input
    if (!groupId || !descricao) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    // Verify the group belongs to the user
    const group = await prisma.cashflowGroup.findFirst({
      where: { 
        id: groupId,
        userId: payload.id
      }
    });

    if (!group) {
      return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 });
    }

    // Get the highest order number in the group to set the new item's order
    const maxOrder = await prisma.cashflowItem.findFirst({
      where: { groupId },
      orderBy: { order: 'desc' },
      select: { order: true }
    });

    const newOrder = (maxOrder?.order || 0) + 1;

    // Create the new item
    const newItem = await prisma.cashflowItem.create({
      data: {
        descricao,
        significado: significado || null,
        groupId,
        isActive: true,
        isInvestment: false,
        rank: null,
        percentTotal: null,
        order: newOrder
      },
      include: {
        valores: true,
      }
    });

    return NextResponse.json(newItem);
  } catch (error) {
    console.error('Erro ao criar item:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 