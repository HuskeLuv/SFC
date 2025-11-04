import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { personalizeGroup, getGroupForUser } from '@/utils/cashflowPersonalization';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Token não fornecido' }, { status: 401 });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; email: string };
    const { groupId, descricao, name, significado } = await request.json();

    // Validate input
    if (!groupId || (!descricao && !name)) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    // Buscar grupo (pode ser template ou personalizado)
    const group = await getGroupForUser(groupId, payload.id);
    if (!group) {
      return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 });
    }

    // Se grupo é template, personalizar antes de adicionar item
    let finalGroupId = group.id;
    if (group.userId === null) {
      finalGroupId = await personalizeGroup(group.id, payload.id);
    }

    // Get the highest rank in the group to set the new item's rank
    const maxRank = await prisma.cashflowItem.findFirst({
      where: { groupId: finalGroupId },
      orderBy: { rank: 'desc' },
      select: { rank: true }
    });

    const newRank = (maxRank?.rank || 0) + 1;

    // Create the new item (sempre personalizado quando criado pelo usuário)
    const newItem = await prisma.cashflowItem.create({
      data: {
        userId: payload.id, // Sempre personalizado quando criado pelo usuário
        name: name || descricao,
        significado: significado || null,
        groupId: finalGroupId,
        rank: newRank,
      },
      include: {
        values: {
          where: { userId: payload.id },
        },
      }
    });

    return NextResponse.json(newItem);
  } catch (error) {
    console.error('Erro ao criar item:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 