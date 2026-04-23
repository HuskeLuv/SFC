import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { transactionPatchSchema, validationError } from '@/utils/validation-schemas';

import { withErrorHandler } from '@/utils/apiErrorHandler';
const EDITABLE_FIELDS = ['quantity', 'price', 'total', 'date', 'fees', 'notes'] as const;

export const PATCH = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id } = await params;

    const body = await request.json();
    const parsed = transactionPatchSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed);
    }

    const updates: Partial<{
      quantity: number;
      price: number;
      total: number;
      date: Date;
      fees: number | null;
      notes: string | null;
    }> = {};

    for (const field of EDITABLE_FIELDS) {
      if (parsed.data[field] !== undefined) {
        if (field === 'date') {
          updates.date = new Date(parsed.data[field] as string);
        } else if (
          field === 'quantity' ||
          field === 'price' ||
          field === 'total' ||
          field === 'fees'
        ) {
          const val = parsed.data[field] as number | null;
          if (val !== null && val !== undefined && !Number.isNaN(val)) {
            (updates as Record<string, unknown>)[field] = val;
          }
        } else if (field === 'notes') {
          updates.notes = parsed.data[field] == null ? null : String(parsed.data[field]);
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo válido para atualização' }, { status: 400 });
    }

    const transaction = await prisma.stockTransaction.findFirst({
      where: { id, userId: targetUserId },
      include: { asset: true, stock: true },
    });

    if (!transaction) {
      return NextResponse.json({ error: 'Transação não encontrada' }, { status: 404 });
    }

    // Manter invariante total = quantity * price ao editar um campo isoladamente;
    // caso contrário, recálculos de portfolio usam valores obsoletos e geram preço médio distorcido.
    const hasQuantity = updates.quantity !== undefined;
    const hasPrice = updates.price !== undefined;
    const hasTotal = updates.total !== undefined;

    if (hasQuantity || hasPrice || hasTotal) {
      const nextQuantity = hasQuantity
        ? (updates.quantity as number)
        : Number(transaction.quantity);
      const nextPrice = hasPrice ? (updates.price as number) : Number(transaction.price);

      if (hasTotal && !hasQuantity && !hasPrice) {
        const nextTotal = updates.total as number;
        if (nextQuantity > 0) {
          updates.price = nextTotal / nextQuantity;
        }
      } else if (!hasTotal) {
        updates.total = nextQuantity * nextPrice;
      }
    }

    await prisma.stockTransaction.update({
      where: { id },
      data: updates,
    });

    if (transaction.assetId || transaction.stockId) {
      const portfolioWhere: { userId: string; assetId?: string; stockId?: string } = {
        userId: targetUserId,
      };
      if (transaction.assetId) {
        portfolioWhere.assetId = transaction.assetId;
      } else if (transaction.stockId) {
        portfolioWhere.stockId = transaction.stockId;
      }

      const portfolio = await prisma.portfolio.findFirst({ where: portfolioWhere });

      if (portfolio) {
        await recalculatePortfolioFromTransactions(
          targetUserId,
          transaction.assetId,
          transaction.stockId,
          portfolio.id,
        );
      }
    }

    return NextResponse.json({ success: true });
  },
);

async function recalculatePortfolioFromTransactions(
  targetUserId: string,
  assetId: string | null,
  stockId: string | null,
  portfolioId: string,
) {
  const txWhere: { userId: string; assetId?: string; stockId?: string } = {
    userId: targetUserId,
  };
  if (assetId) txWhere.assetId = assetId;
  else if (stockId) txWhere.stockId = stockId;

  const allTransactions = await prisma.stockTransaction.findMany({
    where: txWhere,
    orderBy: { date: 'asc' },
  });

  if (allTransactions.length === 0) {
    await prisma.portfolio.delete({
      where: { id: portfolioId },
    });
    return;
  }

  // Custo médio ponderado (moving-average cost basis):
  // - compra acumula qty + custo total
  // - venda remove qty E o CUSTO PROPORCIONAL (qty * avg_at_sale), não o valor da venda.
  // Subtrair a receita da venda como fazia antes distorce o avgPrice toda vez que existe
  // qualquer venda no histórico — o que mascarava edições posteriores em compras.
  let runningQty = 0;
  let runningCost = 0;
  for (const tx of allTransactions) {
    const qty = Number(tx.quantity);
    const price = Number(tx.price);
    const total = Number(tx.total);
    const txValue = total > 0 ? total : qty * price;

    if (tx.type === 'compra') {
      runningQty += qty;
      runningCost += txValue;
    } else if (runningQty > 0) {
      const avgAtSale = runningCost / runningQty;
      const sellQty = Math.min(qty, runningQty);
      runningCost -= avgAtSale * sellQty;
      runningQty -= sellQty;
    }
  }

  const avgPrice = runningQty > 0 ? runningCost / runningQty : 0;

  await prisma.portfolio.update({
    where: { id: portfolioId },
    data: {
      quantity: runningQty,
      avgPrice,
      totalInvested: runningCost,
      lastUpdate: new Date(),
    },
  });
}

export const DELETE = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id } = await params;

    const transaction = await prisma.stockTransaction.findFirst({
      where: { id, userId: targetUserId },
    });

    if (!transaction) {
      return NextResponse.json({ error: 'Transação não encontrada' }, { status: 404 });
    }

    const portfolioWhere: { userId: string; assetId?: string; stockId?: string } = {
      userId: targetUserId,
    };
    if (transaction.assetId) {
      portfolioWhere.assetId = transaction.assetId;
    } else if (transaction.stockId) {
      portfolioWhere.stockId = transaction.stockId;
    }

    const portfolio =
      portfolioWhere.assetId || portfolioWhere.stockId
        ? await prisma.portfolio.findFirst({ where: portfolioWhere })
        : null;

    await prisma.stockTransaction.delete({
      where: { id },
    });

    if (portfolio) {
      await recalculatePortfolioFromTransactions(
        targetUserId,
        transaction.assetId,
        transaction.stockId,
        portfolio.id,
      );
    }

    return NextResponse.json({ success: true });
  },
);
