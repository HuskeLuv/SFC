import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';

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

    let updatedItem;

    if (field === 'descricao' || field === 'significado' || field === 'percentTotal') {
      // Update item fields
      const updateData: {
        descricao?: string;
        significado?: string;
        percentTotal?: number;
      } = {};
      if (field === 'descricao') updateData.descricao = value;
      if (field === 'significado') updateData.significado = value;
      if (field === 'percentTotal') updateData.percentTotal = parseFloat(value);

      updatedItem = await prisma.cashflowItem.update({
        where: { 
          id: itemId,
          group: {
            userId: payload.id
          }
        },
        data: updateData,
        include: {
          valores: true,
        }
      });
    } else if (field === 'monthlyValue' && typeof monthIndex === 'number') {
      // Update monthly value
      const existingValue = await prisma.cashflowValue.findFirst({
        where: {
          itemId: itemId,
          mes: monthIndex
        }
      });

      if (existingValue) {
        // Update existing value
        await prisma.cashflowValue.update({
          where: { id: existingValue.id },
          data: { valor: parseFloat(value) }
        });
      } else {
        // Create new value
        await prisma.cashflowValue.create({
          data: {
            itemId: itemId,
            mes: monthIndex,
            valor: parseFloat(value)
          }
        });
      }

      updatedItem = await prisma.cashflowItem.findUnique({
        where: { id: itemId },
        include: { valores: true }
      });
    } else if (field === 'annualTotal') {
      // Update annual total by distributing the value across all months
      const annualTotal = parseFloat(value);
      const monthlyValue = annualTotal / 12;

      // Delete all existing monthly values
      await prisma.cashflowValue.deleteMany({
        where: { itemId: itemId }
      });

      // Create new monthly values with equal distribution
      for (let month = 0; month < 12; month++) {
        await prisma.cashflowValue.create({
          data: {
            itemId: itemId,
            mes: month,
            valor: monthlyValue
          }
        });
      }

      updatedItem = await prisma.cashflowItem.findUnique({
        where: { id: itemId },
        include: { valores: true }
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