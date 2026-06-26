import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { ensurePersonalizedItem } from '@/utils/cashflowPersonalization';
import { cashflowBatchUpdateSchema, validationError } from '@/utils/validation-schemas';
import { syncCashflowToObjetivo } from '@/services/planejamento/cashflowToSonhoSync';

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
  const { groupId: _groupId, updates, deletes } = parsed.data;

  const currentYear = new Date().getFullYear();
  const results: Array<{ itemId: string; success: boolean; error?: string }> = [];

  // Processar deletados — single round-trip de ownership check + bulk delete
  // em transação. Antes era 1 findFirst + 1 transação por id (até 3N RTTs).
  if (deletes && Array.isArray(deletes) && deletes.length > 0) {
    try {
      const owned = await prisma.cashflowItem.findMany({
        where: { id: { in: deletes }, userId: targetUserId },
        select: { id: true, objetivoId: true },
      });
      // Linhas vinculadas a um sonho não podem ser excluídas pelo fluxo de caixa
      // (o sonho é a fonte; excluir é no Planejamento de Sonhos).
      const linkedIds = new Set(owned.filter((i) => i.objetivoId).map((i) => i.id));
      const ownedIds = new Set(owned.filter((i) => !i.objetivoId).map((i) => i.id));

      if (ownedIds.size > 0) {
        const ids = [...ownedIds];
        await prisma.$transaction([
          prisma.cashflowValue.deleteMany({ where: { itemId: { in: ids } } }),
          prisma.cashflowItem.deleteMany({
            where: { id: { in: ids }, userId: targetUserId },
          }),
        ]);
      }

      for (const itemId of deletes) {
        if (ownedIds.has(itemId)) {
          results.push({ itemId, success: true });
        } else if (linkedIds.has(itemId)) {
          results.push({
            itemId,
            success: false,
            error: 'Linha vinculada a um sonho — exclua no Planejamento de Sonhos.',
          });
        } else {
          results.push({ itemId, success: false, error: 'Item não encontrado' });
        }
      }
    } catch (error) {
      logger.error('Erro ao deletar items:', error);
      for (const itemId of deletes) {
        results.push({ itemId, success: false, error: 'Erro ao deletar' });
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
        // o realizado e pinta de verde), mas nome/significado/rank são da fonte
        // (o sonho) e não podem ser alterados aqui.
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
                    year: currentYear,
                    month,
                  },
                },
                update: { value: numericValue, ...colorOverride },
                create: {
                  itemId: finalItemId,
                  userId: targetUserId,
                  year: currentYear,
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
