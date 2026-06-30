import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { ensurePersonalizedItem } from '@/utils/cashflowPersonalization';
import { cashflowBatchUpdateSchema, validationError } from '@/utils/validation-schemas';
import { syncCashflowToObjetivo } from '@/services/planejamento/cashflowToSonhoSync';
import { removeObjetivoCashflow } from '@/services/planejamento/sonhoCashflowSync';

import { withErrorHandler } from '@/utils/apiErrorHandler';
/**
 * PUT /api/cashflow/batch-update
 *
 * Recebe múltiplas alterações de itens e valores em uma única requisição.
 *
 * Body:
 * {
 *   groupId: string,
 *   updates: Array<{
 *     itemId: string,
 *     name?: string,
 *     significado?: string | null,
 *     rank?: string | null,
 *     values?: Array<{ month: number; value: number; color?: string | null }>
 *   }>,
 *   deletes: string[]
 * }
 */
export const PUT = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow/batch-update',
    'PUT',
  );

  const body = await request.json();
  const parsed = cashflowBatchUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { groupId: _groupId, updates, deletes, year } = parsed.data;

  const targetYear = year ?? new Date().getFullYear();
  const results: Array<{ itemId: string; success: boolean; error?: string }> = [];

  // Processar deletados. Linhas livres: bulk delete em transação. Linhas
  // vinculadas a um sonho: excluir AQUI propaga a exclusão pro Planejamento
  // (remove o objetivo + entries + linha-espelho) — liberado na reunião
  // jun/2026, com confirmação no front.
  if (deletes && Array.isArray(deletes) && deletes.length > 0) {
    const owned = await prisma.cashflowItem.findMany({
      where: { id: { in: deletes }, userId: targetUserId },
      select: { id: true, objetivoId: true },
    });
    const ownedFree = owned.filter((i) => !i.objetivoId).map((i) => i.id);
    const ownedLinked = owned.filter(
      (i): i is { id: string; objetivoId: string } => i.objetivoId != null,
    );
    const handled = new Set<string>();

    // 1) Linhas livres — single round-trip (values + items) em transação.
    if (ownedFree.length > 0) {
      try {
        await prisma.$transaction([
          prisma.cashflowValue.deleteMany({ where: { itemId: { in: ownedFree } } }),
          prisma.cashflowItem.deleteMany({
            where: { id: { in: ownedFree }, userId: targetUserId },
          }),
        ]);
        for (const id of ownedFree) {
          results.push({ itemId: id, success: true });
          handled.add(id);
        }
      } catch (error) {
        logger.error('Erro ao deletar items:', error);
        for (const id of ownedFree) {
          results.push({ itemId: id, success: false, error: 'Erro ao deletar' });
          handled.add(id);
        }
      }
    }

    // 2) Linhas de sonho — propaga pro Planejamento. FK é SetNull, então remove
    //    a linha-espelho (removeObjetivoCashflow) antes de apagar o objetivo
    //    (cascade nas entries).
    for (const { id: itemId, objetivoId } of ownedLinked) {
      handled.add(itemId);
      try {
        const obj = await prisma.planejamentoObjetivo.findFirst({
          where: { id: objetivoId, userId: targetUserId },
          select: { id: true },
        });
        if (!obj) {
          results.push({ itemId, success: false, error: 'Sonho não encontrado' });
          continue;
        }
        await removeObjetivoCashflow(objetivoId);
        await prisma.planejamentoObjetivo.delete({ where: { id: objetivoId } });
        results.push({ itemId, success: true });
      } catch (error) {
        logger.error(`Erro ao excluir sonho vinculado ao item ${itemId}:`, error);
        results.push({ itemId, success: false, error: 'Erro ao excluir sonho' });
      }
    }

    // 3) Ids que não pertencem ao usuário (nem livres, nem vinculados).
    for (const itemId of deletes) {
      if (!handled.has(itemId)) {
        results.push({ itemId, success: false, error: 'Item não encontrado' });
      }
    }
  }

  // Objetivos cujas linhas-espelho foram editadas — re-derivar o "Realizado"
  // (sync caixa→sonho) ao final, fora do loop.
  const affectedObjetivos = new Set<string>();

  // Processar atualizações
  if (updates && Array.isArray(updates) && updates.length > 0) {
    for (const update of updates) {
      try {
        const { itemId, name, significado, rank, values } = update;

        if (!itemId) {
          results.push({ itemId: '', success: false, error: 'itemId é obrigatório' });
          continue;
        }

        // Ensure item is personalized (creates a copy if it's a template)
        let finalItemId: string;
        try {
          ({ itemId: finalItemId } = await ensurePersonalizedItem(itemId, targetUserId));
        } catch {
          results.push({ itemId, success: false, error: 'Item não encontrado' });
          continue;
        }

        // Linha vinculada a um sonho: valores/cor são editáveis (o cliente lança
        // o realizado e pinta de vermelho "Pago"), mas nome/significado/rank são
        // da fonte (o sonho) e não podem ser alterados aqui.
        const linked = await prisma.cashflowItem.findUnique({
          where: { id: finalItemId },
          select: { objetivoId: true },
        });
        const objetivoId = linked?.objetivoId ?? null;

        // Atualizar campos do item (somente em linhas livres)
        const itemUpdateData: {
          name?: string;
          significado?: string | null;
          rank?: string | null;
        } = {};

        if (!objetivoId) {
          if (name !== undefined) itemUpdateData.name = name;
          if (significado !== undefined) itemUpdateData.significado = significado;
          if (rank !== undefined) itemUpdateData.rank = rank;

          if (Object.keys(itemUpdateData).length > 0) {
            await prisma.cashflowItem.update({
              where: { id: finalItemId },
              data: itemUpdateData,
            });
          }
        }

        // Atualizar valores mensais — upsert na chave composta `(itemId, userId,
        // year, month)`, paralelizado por mês. Antes era findFirst + update/create
        // sequencial (até 24 RTTs por item × 12 meses).
        if (values && Array.isArray(values) && values.length > 0) {
          const validValues: Array<{
            month: number;
            numericValue: number;
            color?: string | null;
          }> = [];
          for (const { month, value, color } of values) {
            if (typeof month !== 'number' || month < 0 || month > 11) continue;
            const numericValue = parseFloat(value.toString());
            if (!Number.isFinite(numericValue)) continue;
            validValues.push({ month, numericValue, color });
          }

          await Promise.all(
            validValues.map(({ month, numericValue, color }) => {
              const colorOverride = color !== undefined ? { color } : {};
              return prisma.cashflowValue.upsert({
                where: {
                  itemId_userId_year_month: {
                    itemId: finalItemId,
                    userId: targetUserId,
                    year: targetYear,
                    month,
                  },
                },
                update: { value: numericValue, ...colorOverride },
                create: {
                  itemId: finalItemId,
                  userId: targetUserId,
                  year: targetYear,
                  month,
                  value: numericValue,
                  color: color !== undefined ? color : null,
                },
              });
            }),
          );
        }

        if (objetivoId) affectedObjetivos.add(objetivoId);
        results.push({ itemId, success: true });
      } catch (error) {
        logger.error(`Erro ao atualizar item ${update.itemId}:`, error);
        results.push({
          itemId: update.itemId || '',
          success: false,
          error: 'Erro ao atualizar',
        });
      }
    }
  }

  // Re-deriva o "Realizado" dos sonhos cujas linhas foram editadas (best-effort:
  // uma falha aqui não invalida o salvamento do fluxo de caixa).
  for (const objetivoId of affectedObjetivos) {
    try {
      await syncCashflowToObjetivo(targetUserId, objetivoId);
    } catch (error) {
      logger.error(`Erro ao sincronizar sonho ${objetivoId} a partir do caixa:`, error);
    }
  }

  return NextResponse.json({
    success: true,
    results,
    message: 'Alterações salvas com sucesso',
  });
});
