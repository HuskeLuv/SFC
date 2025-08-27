import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

// GET - Buscar investimentos categorizados do usuário
export async function GET(request: NextRequest) {
  try {
    const payload = requireAuth(request);

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Buscar investimentos do usuário
    const investimentos = await prisma.cashflowItem.findMany({
      where: {
        group: {
          userId: user.id,
        },
        isInvestment: true,
        isActive: true,
      },
      include: {
        valores: true,
        group: true,
      },
      orderBy: { descricao: 'asc' },
    });

    return NextResponse.json(investimentos);
    
  } catch (error) {
    if (error instanceof Error && error.message === 'Não autorizado') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    console.error('Erro ao buscar investimentos:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// POST - Adicionar novo investimento categorizado
export async function POST(request: NextRequest) {
  try {
    const payload = requireAuth(request);

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const { 
      descricao, 
      categoria, 
      valor, 
      observacoes 
    } = await request.json();

    // Validações
    if (!descricao || !categoria || !valor) {
      return NextResponse.json({ 
        error: 'Campos obrigatórios: descricao, categoria, valor' 
      }, { status: 400 });
    }

    if (valor <= 0) {
      return NextResponse.json({ error: 'Valor deve ser maior que zero' }, { status: 400 });
    }

    // Buscar ou criar grupo de investimentos
    let grupoInvestimentos = await prisma.cashflowGroup.findFirst({
      where: {
        userId: user.id,
        name: 'Investimentos',
        type: 'Entradas',
      },
    });

    if (!grupoInvestimentos) {
      grupoInvestimentos = await prisma.cashflowGroup.create({
        data: {
          userId: user.id,
          name: 'Investimentos',
          type: 'Entradas',
          order: 999,
          isActive: true,
        },
      });
    }

    // Criar o item de investimento
    const investimento = await prisma.cashflowItem.create({
      data: {
        groupId: grupoInvestimentos.id,
        descricao,
        categoria,
        observacoes: observacoes || null,
        order: 1,
        isActive: true,
        isInvestment: true,
      },
    });

    // Adicionar valor para o mês atual
    const mesAtual = new Date().getMonth(); // 0 = Janeiro, 11 = Dezembro
    
    await prisma.cashflowValue.create({
      data: {
        itemId: investimento.id,
        mes: mesAtual,
        valor: valor,
        status: 'aplicado',
        observacoes: `Investimento adicionado em ${new Date().toLocaleDateString('pt-BR')}`,
      },
    });

    // Buscar o investimento criado com todos os dados
    const investimentoCompleto = await prisma.cashflowItem.findUnique({
      where: { id: investimento.id },
      include: {
        valores: true,
        group: true,
      },
    });

    return NextResponse.json(investimentoCompleto, { status: 201 });
    
  } catch (error) {
    if (error instanceof Error && error.message === 'Não autorizado') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    console.error('Erro ao adicionar investimento:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 