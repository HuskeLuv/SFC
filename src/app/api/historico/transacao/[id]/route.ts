import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { transactionPatchSchema, validationError } from '@/utils/validation-schemas';
import { recalculatePortfolioFromTransactions } from '@/services/portfolio/portfolioRecalculation';

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
        await recalculatePortfolioFromTransactions({
          targetUserId,
          assetId: transaction.assetId,
          stockId: transaction.stockId,
          portfolioId: portfolio.id,
        });
      }
    }

    return NextResponse.json({ success: true });
  },
);

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
      await recalculatePortfolioFromTransactions({
        targetUserId,
        assetId: transaction.assetId,
        stockId: transaction.stockId,
        portfolioId: portfolio.id,
      });
    }

    return NextResponse.json({ success: true });
  },
);
