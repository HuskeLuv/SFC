import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { stockTransactionSchema, validationError } from '@/utils/validation-schemas';
import { withErrorHandler } from '@/utils/apiErrorHandler';

// GET - Buscar transações do usuário
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  const transactions = await prisma.stockTransaction.findMany({
    where: { userId: user.id },
    include: {
      stock: true,
    },
    orderBy: { date: 'desc' },
  });

  return NextResponse.json(transactions);
});

// POST - Registrar nova transação
export const POST = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  const body = await request.json();
  const parsed = stockTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { stockId, type, quantity, price, date, fees, notes } = parsed.data;

  // Verificar se o ativo existe
  const stock = await prisma.stock.findUnique({
    where: { id: stockId },
  });

  if (!stock) {
    return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 });
  }

  const total = quantity * price;
  const transactionDate = new Date(date);

  // Criar transação
  const transaction = await prisma.stockTransaction.create({
    data: {
      userId: user.id,
      stockId: stockId,
      type,
      quantity,
      price,
      total,
      date: transactionDate,
      fees: fees || 0,
      notes: notes || null,
    },
    include: {
      stock: true,
    },
  });

  // Atualizar portfolio
  await updatePortfolio(user.id, stockId, type, quantity, price, total);

  return NextResponse.json(transaction, { status: 201 });
});

// Função para atualizar o portfolio
async function updatePortfolio(
  userId: string,
  stockId: string,
  type: string,
  quantity: number,
  price: number,
  total: number,
) {
  try {
    const existingPortfolio = await prisma.portfolio.findUnique({
      where: {
        userId_stockId: {
          userId,
          stockId,
        },
      },
    });

    if (type === 'compra') {
      if (existingPortfolio) {
        // Atualizar portfolio existente
        const newQuantity = existingPortfolio.quantity + quantity;
        const newTotalInvested = existingPortfolio.totalInvested + total;
        const newAvgPrice = newTotalInvested / newQuantity;

        await prisma.portfolio.update({
          where: {
            userId_stockId: {
              userId,
              stockId,
            },
          },
          data: {
            quantity: newQuantity,
            avgPrice: newAvgPrice,
            totalInvested: newTotalInvested,
            lastUpdate: new Date(),
          },
        });
      } else {
        // Criar novo portfolio
        await prisma.portfolio.create({
          data: {
            userId,
            stockId,
            quantity,
            avgPrice: price,
            totalInvested: total,
            lastUpdate: new Date(),
          },
        });
      }
    } else if (type === 'venda') {
      if (existingPortfolio) {
        if (existingPortfolio.quantity < quantity) {
          throw new Error('Quantidade insuficiente para venda');
        }

        const newQuantity = existingPortfolio.quantity - quantity;
        const soldValue = quantity * existingPortfolio.avgPrice;
        const newTotalInvested = existingPortfolio.totalInvested - soldValue;

        if (newQuantity === 0) {
          // Remover portfolio se quantidade for zero
          await prisma.portfolio.delete({
            where: {
              userId_stockId: {
                userId,
                stockId,
              },
            },
          });
        } else {
          // Atualizar portfolio
          await prisma.portfolio.update({
            where: {
              userId_stockId: {
                userId,
                stockId,
              },
            },
            data: {
              quantity: newQuantity,
              totalInvested: newTotalInvested,
              lastUpdate: new Date(),
            },
          });
        }
      } else {
        throw new Error('Portfolio não encontrado para venda');
      }
    }
  } catch (error) {
    console.error('Erro ao atualizar portfolio:', error);
    throw error;
  }
}
