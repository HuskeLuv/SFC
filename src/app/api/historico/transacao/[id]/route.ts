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

      const portfolio = await prisma.portfolio.findFirst({
        where: portfolioWhere,
      });

      if (portfolio) {
        const txWhere: { userId: string; assetId?: string; stockId?: string } = {
          userId: targetUserId,
        };
        if (transaction.assetId) txWhere.assetId = transaction.assetId;
        else if (transaction.stockId) txWhere.stockId = transaction.stockId;

        const allTransactions = await prisma.stockTransaction.findMany({
          where: txWhere,
          orderBy: { date: 'asc' },
        });

        let totalInvested = 0;
        let totalQuantity = 0;

        for (const tx of allTransactions) {
          const qty = Number(tx.quantity);
          const price = Number(tx.price);
          const total = Number(tx.total);
          if (tx.type === 'compra') {
            totalQuantity += qty;
            totalInvested += total > 0 ? total : qty * price;
          } else {
            totalQuantity -= qty;
            totalInvested -= total > 0 ? total : qty * price;
          }
        }

        const avgPrice = totalQuantity > 0 ? totalInvested / totalQuantity : 0;

        await prisma.portfolio.update({
          where: { id: portfolio.id },
          data: {
            quantity: totalQuantity,
            avgPrice: avgPrice,
            totalInvested: totalInvested,
            lastUpdate: new Date(),
          },
        });
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

  let totalInvested = 0;
  let totalQuantity = 0;

  for (const tx of allTransactions) {
    const qty = Number(tx.quantity);
    const price = Number(tx.price);
    const total = Number(tx.total);
    if (tx.type === 'compra') {
      totalQuantity += qty;
      totalInvested += total > 0 ? total : qty * price;
    } else {
      totalQuantity -= qty;
      totalInvested -= total > 0 ? total : qty * price;
    }
  }

  const avgPrice = totalQuantity > 0 ? totalInvested / totalQuantity : 0;

  await prisma.portfolio.update({
    where: { id: portfolioId },
    data: {
      quantity: totalQuantity,
      avgPrice: avgPrice,
      totalInvested: totalInvested,
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
