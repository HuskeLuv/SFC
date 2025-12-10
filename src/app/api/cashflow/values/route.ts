import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { personalizeItem, getItemForUser } from '@/utils/cashflowPersonalization';

export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Token não fornecido' }, { status: 401 });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; email: string };
    const { itemId, field, value, monthIndex } = await request.json();

    // Validate input
    if (!itemId || !field || value === undefined) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    // Buscar item (pode ser template ou personalizado)
    const item = await getItemForUser(itemId, payload.id);
    if (!item) {
      return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
    }

    // Se é template, criar cópia personalizada antes de editar
    let finalItemId = item.id;
    if (item.userId === null) {
      // É template - criar cópia personalizada
      finalItemId = await personalizeItem(item.id, payload.id);
    }

    let updatedItem;

    if (field === 'name' || field === 'descricao' || field === 'significado' || field === 'rank') {
      // Update item fields
      const updateData: {
        name?: string;
        significado?: string;
        rank?: string | null;
      } = {};
      if (field === 'name' || field === 'descricao') updateData.name = value;
      if (field === 'significado') updateData.significado = value;
      if (field === 'rank') {
        updateData.rank = value === '' || value === null ? null : value.toString();
      }

      updatedItem = await prisma.cashflowItem.update({
        where: { 
          id: finalItemId,
        },
        data: updateData,
        include: {
          values: {
            where: { userId: payload.id },
          },
        }
      });
    } else if (field === 'monthlyValue' && typeof monthIndex === 'number') {
      // Se é template, garantir que item foi personalizado
      if (item.userId === null) {
        finalItemId = await personalizeItem(item.id, payload.id);
      }

      const currentYear = new Date().getFullYear();
      
      // Update monthly value
      const existingValue = await prisma.cashflowValue.findFirst({
        where: {
          itemId: finalItemId,
          userId: payload.id,
          year: currentYear,
          month: monthIndex
        }
      });

      if (existingValue) {
        // Update existing value
        await prisma.cashflowValue.update({
          where: { id: existingValue.id },
          data: { value: parseFloat(value.toString()) }
        });
      } else {
        // Create new value
        await prisma.cashflowValue.create({
          data: {
            itemId: finalItemId,
            userId: payload.id,
            year: currentYear,
            month: monthIndex,
            value: parseFloat(value.toString())
          }
        });
      }

      updatedItem = await prisma.cashflowItem.findUnique({
        where: { id: finalItemId },
        include: { 
          values: {
            where: { userId: payload.id }
          }
        }
      });
    } else if (field === 'annualTotal') {
      // Se é template, garantir que item foi personalizado
      if (item.userId === null) {
        finalItemId = await personalizeItem(item.id, payload.id);
      }

      const currentYear = new Date().getFullYear();
      const annualTotal = parseFloat(value.toString());
      const monthlyValue = annualTotal / 12;

      // Delete all existing monthly values for this user and year
      await prisma.cashflowValue.deleteMany({
        where: { 
          itemId: finalItemId,
          userId: payload.id,
          year: currentYear
        }
      });

      // Create new monthly values with equal distribution
      for (let month = 0; month < 12; month++) {
        await prisma.cashflowValue.create({
          data: {
            itemId: finalItemId,
            userId: payload.id,
            year: currentYear,
            month: month,
            value: monthlyValue
          }
        });
      }

      updatedItem = await prisma.cashflowItem.findUnique({
        where: { id: finalItemId },
        include: { 
          values: {
            where: { userId: payload.id }
          }
        }
      });
    } else {
      return NextResponse.json({ error: 'Campo inválido' }, { status: 400 });
    }

    if (!updatedItem) {
      return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
    }

    return NextResponse.json(updatedItem);
  } catch (error) {
    console.error('Erro ao atualizar valor:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 