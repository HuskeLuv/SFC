import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { transactionPatchSchema, validationError } from '@/utils/validation-schemas';
import { recalculatePortfolioFromTransactions } from '@/services/portfolio/portfolioRecalculation';
import { syncSonhoRealizadoBestEffort } from '@/services/planejamento/carteiraToSonhoRealizado';
import {
  recordChange,
  diffFields,
  finalStateChanges,
  assetEntityLabel,
  buildTransacaoSnapshot,
  TRANSACTION_FIELD_LABELS,
} from '@/services/changeHistory';

import { withErrorHandler } from '@/utils/apiErrorHandler';
const EDITABLE_FIELDS = ['quantity', 'price', 'total', 'date', 'fees', 'notes'] as const;

export const PATCH = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await requireAuthWithActing(request);
    const { targetUserId } = auth;
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
      include: { asset: true },
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

    // Bug #02: cutoff para invalidar série MWR/TWR é o min(data antiga, data nova).
    // Se a edição só muda valor (sem mexer em date), basta cobrir a data da transação.
    const oldDate = transaction.date;
    const newDate = updates.date ?? oldDate;
    const snapshotCutoff = oldDate.getTime() <= newDate.getTime() ? oldDate : newDate;

    await prisma.stockTransaction.update({
      where: { id },
      data: updates,
    });

    if (transaction.assetId) {
      const portfolio = await prisma.portfolio.findFirst({
        where: { userId: targetUserId, assetId: transaction.assetId },
      });

      if (portfolio) {
        await recalculatePortfolioFromTransactions({
          targetUserId,
          assetId: transaction.assetId,
          portfolioId: portfolio.id,
          recomputeSnapshotsFrom: snapshotCutoff,
        });
      }

      // Ativo vinculado a um sonho: editar a transação re-deriva o realizado.
      await syncSonhoRealizadoBestEffort(targetUserId, { assetId: transaction.assetId });
    }

    await recordChange({
      request,
      auth,
      section: 'carteira',
      action: 'transacao.editar',
      entity: 'transacao',
      entityId: id,
      entityLabel: assetEntityLabel(transaction.asset),
      changes: diffFields(transaction, updates, TRANSACTION_FIELD_LABELS),
    });

    return NextResponse.json({ success: true });
  },
);

export const DELETE = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await requireAuthWithActing(request);
    const { targetUserId } = auth;
    const { id } = await params;

    const transaction = await prisma.stockTransaction.findFirst({
      where: { id, userId: targetUserId },
      include: { asset: { select: { symbol: true, name: true, source: true } } },
    });

    if (!transaction) {
      return NextResponse.json({ error: 'Transação não encontrada' }, { status: 404 });
    }

    const portfolio = transaction.assetId
      ? await prisma.portfolio.findFirst({
          where: { userId: targetUserId, assetId: transaction.assetId },
        })
      : null;

    // O recálculo deleta Portfolio + FixedIncomeAsset quando a última transação
    // some — o snapshot precisa dos dois pro undo recriar a posição inteira.
    const fixedIncome = transaction.assetId
      ? await prisma.fixedIncomeAsset.findUnique({ where: { assetId: transaction.assetId } })
      : null;

    const snapshotCutoff = transaction.date;

    await prisma.stockTransaction.delete({
      where: { id },
    });

    if (portfolio) {
      await recalculatePortfolioFromTransactions({
        targetUserId,
        assetId: transaction.assetId,
        portfolioId: portfolio.id,
        recomputeSnapshotsFrom: snapshotCutoff,
      });
    }

    // Ativo vinculado a um sonho: excluir a transação re-deriva o realizado.
    if (transaction.assetId) {
      await syncSonhoRealizadoBestEffort(targetUserId, { assetId: transaction.assetId });
    }

    await recordChange({
      request,
      auth,
      section: 'carteira',
      action: 'transacao.excluir',
      entity: 'transacao',
      entityId: id,
      entityLabel: assetEntityLabel(transaction.asset),
      changes: finalStateChanges(transaction, TRANSACTION_FIELD_LABELS),
      snapshot: buildTransacaoSnapshot(transaction, { portfolio, fixedIncome }),
    });

    return NextResponse.json({ success: true });
  },
);
