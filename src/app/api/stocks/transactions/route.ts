import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { stockTransactionSchema, validationError } from '@/utils/validation-schemas';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { parsePaginationParams, paginatedResponse } from '@/utils/pagination';

// GET - Buscar transações do usuário
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  const pagination = parsePaginationParams(request);

  if (!pagination) {
    const transactions = await prisma.stockTransaction.findMany({
      where: { userId: user.id },
      include: {
        stock: true,
      },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json(transactions);
  }

  const where = { userId: user.id };
  const [count, transactions] = await Promise.all([
    prisma.stockTransaction.count({ where }),
    prisma.stockTransaction.findMany({
      where,
      include: { stock: true },
      orderBy: { date: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    }),
  ]);

  return NextResponse.json(
    paginatedResponse(transactions, count, pagination.page, pagination.limit),
  );
});

// POST - Registrar nova transação
export const POST = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const body = await request.json();
  const parsed = stockTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { stockId, type, quantity, price, date, fees, notes } = parsed.data;

  // Lookups independentes — paralelizados.
  const [user, stock] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetUserId } }),
    prisma.stock.findUnique({ where: { id: stockId } }),
  ]);

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }
  if (!stock) {
    return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 });
  }

  const total = quantity * price;
  const transactionDate = new Date(date);

  // Cria a transação e ajusta o Portfolio na mesma transação atômica — sem isso,
  // uma falha em updatePortfolio (ex: venda sem posição) deixava a stockTransaction
  // gravada órfã e divergente do estado da carteira.
  const transaction = await prisma.$transaction(async (tx) => {
    const created = await tx.stockTransaction.create({
      data: {
        userId: user.id,
        stockId,
        type,
        quantity,
        price,
        total,
        date: transactionDate,
        fees: fees || 0,
        notes: notes || null,
      },
      include: { stock: true },
    });

    await updatePortfolio(tx, user.id, stockId, type, quantity, price, total);
    return created;
  });

  return NextResponse.json(transaction, { status: 201 });
});

// Função para atualizar o portfolio. Recebe o client da transação ativa para
// que tudo rode no mesmo BEGIN/COMMIT do POST.
type PortfolioClient = {
  portfolio: {
    findUnique: typeof prisma.portfolio.findUnique;
    create: typeof prisma.portfolio.create;
    update: typeof prisma.portfolio.update;
    delete: typeof prisma.portfolio.delete;
  };
};

async function updatePortfolio(
  client: PortfolioClient,
  userId: string,
  stockId: string,
  type: string,
  quantity: number,
  price: number,
  total: number,
) {
  try {
    const existingPortfolio = await client.portfolio.findUnique({
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

        await client.portfolio.update({
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
        await client.portfolio.create({
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
          await client.portfolio.delete({
            where: {
              userId_stockId: {
                userId,
                stockId,
              },
            },
          });
        } else {
          // Atualizar portfolio
          await client.portfolio.update({
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
