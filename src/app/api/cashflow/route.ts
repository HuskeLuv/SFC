import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Verificar autenticação
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Token não fornecido' }, { status: 401 });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; email: string };
    
    // Buscar grupos do usuário logado com hierarquia completa
    const groups = await prisma.cashflowGroup.findMany({
      where: { 
        userId: payload.id,
        parentId: null 
      },
      orderBy: { order: 'asc' },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: {
            valores: true,
          },
        },
        children: {
          orderBy: { order: 'asc' },
          include: {
            items: {
              orderBy: { order: 'asc' },
              include: { valores: true },
            },
            children: {
              orderBy: { order: 'asc' },
              include: {
                items: {
                  orderBy: { order: 'asc' },
                  include: { valores: true },
                },
              },
            },
          },
        },
      },
    });
    
    return NextResponse.json(groups);
  } catch (error) {
    console.error('Erro na API cashflow:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST pode ser adaptado depois para criar itens/valores/grupos 