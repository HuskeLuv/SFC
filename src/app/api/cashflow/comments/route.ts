import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { personalizeItem, getItemForUser } from '@/utils/cashflowPersonalization';

/**
 * GET /api/cashflow/comments
 * Busca comentário de uma célula específica
 * Query params: itemId, month, year
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Token não fornecido' }, { status: 401 });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; email: string };
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('itemId');
    const month = searchParams.get('month');
    const year = searchParams.get('year');

    if (!itemId || month === null || year === null) {
      return NextResponse.json({ error: 'Parâmetros obrigatórios: itemId, month, year' }, { status: 400 });
    }

    // Buscar item (pode ser template ou personalizado)
    const item = await getItemForUser(itemId, payload.id);
    if (!item) {
      return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
    }

    // Se é template, usar item personalizado se existir
    let finalItemId = item.id;
    if (item.userId === null) {
      // Tentar encontrar item personalizado
      const personalizedItem = await prisma.cashflowItem.findFirst({
        where: {
          name: item.name,
          groupId: item.groupId,
          userId: payload.id,
        },
      });
      if (personalizedItem) {
        finalItemId = personalizedItem.id;
      }
    }

    const monthIndex = parseInt(month, 10);
    const yearInt = parseInt(year, 10);

    if (isNaN(monthIndex) || isNaN(yearInt) || monthIndex < 0 || monthIndex > 11) {
      return NextResponse.json({ error: 'Parâmetros inválidos: month deve ser 0-11, year deve ser um número' }, { status: 400 });
    }

    // Buscar valor mensal e seu comentário
    const cashflowValue = await prisma.cashflowValue.findFirst({
      where: {
        itemId: finalItemId,
        userId: payload.id,
        year: yearInt,
        month: monthIndex,
      },
      select: {
        id: true,
        comment: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      comment: cashflowValue?.comment || null,
      updatedAt: cashflowValue?.updatedAt || null,
    });
  } catch (error) {
    console.error('Erro ao buscar comentário:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

/**
 * PATCH /api/cashflow/comments
 * Salva ou atualiza comentário de uma célula específica
 * Body: { itemId, month, year, comment }
 */
export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Token não fornecido' }, { status: 401 });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; email: string };
    const { itemId, month, year, comment } = await request.json();
    
    // Log para debug (remover em produção se necessário)
    console.log(`[PATCH /api/cashflow/comments] Usuário ID do token: ${payload.id}, Email: ${payload.email}`);

    // Validate input
    if (!itemId || typeof month !== 'number' || typeof year !== 'number') {
      return NextResponse.json({ error: 'Dados inválidos: itemId, month e year são obrigatórios' }, { status: 400 });
    }

    if (month < 0 || month > 11) {
      return NextResponse.json({ error: 'month deve ser entre 0 (Janeiro) e 11 (Dezembro)' }, { status: 400 });
    }

    // Buscar item (pode ser template ou personalizado)
    const item = await getItemForUser(itemId, payload.id);
    if (!item) {
      return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
    }

    // Se é template, personalizar antes de adicionar comentário
    let finalItemId = item.id;
    if (item.userId === null) {
      try {
        finalItemId = await personalizeItem(item.id, payload.id);
      } catch (error: any) {
        console.error('Erro ao personalizar item:', error);
        // Se o erro for sobre usuário não encontrado, pode ser que o token esteja usando ID antigo
        if (error.message && error.message.includes('Usuário não encontrado')) {
          return NextResponse.json(
            { error: 'Sessão inválida. Por favor, faça login novamente.' },
            { status: 401 }
          );
        }
        return NextResponse.json(
          { error: error.message || 'Erro ao personalizar item.' },
          { status: 500 }
        );
      }
    }

    // Normalizar comment (null se string vazia, trim se não vazio)
    const normalizedComment = typeof comment === 'string' && comment.trim() === '' ? null : (comment || null);

    // Buscar ou criar CashflowValue
    const existingValue = await prisma.cashflowValue.findFirst({
      where: {
        itemId: finalItemId,
        userId: payload.id,
        year: year,
        month: month,
      },
    });

    if (existingValue) {
      // Atualizar comentário existente
      const updatedValue = await prisma.cashflowValue.update({
        where: { id: existingValue.id },
        data: { comment: normalizedComment },
        select: {
          id: true,
          comment: true,
          updatedAt: true,
        },
      });

      return NextResponse.json({
        success: true,
        comment: updatedValue.comment,
        updatedAt: updatedValue.updatedAt,
      });
    } else {
      // Se não existe valor, criar um com valor 0 e o comentário
      // Primeiro buscar o valor original do item para usar como padrão
      const defaultValue = 0;

      const newValue = await prisma.cashflowValue.create({
        data: {
          itemId: finalItemId,
          userId: payload.id,
          year: year,
          month: month,
          value: defaultValue,
          comment: normalizedComment,
        },
        select: {
          id: true,
          comment: true,
          updatedAt: true,
        },
      });

      return NextResponse.json({
        success: true,
        comment: newValue.comment,
        updatedAt: newValue.updatedAt,
      });
    }
  } catch (error) {
    console.error('Erro ao salvar comentário:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

