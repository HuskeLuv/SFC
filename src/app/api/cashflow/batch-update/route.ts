import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { ensurePersonalizedItem } from '@/utils/cashflowPersonalization';
import { cashflowBatchUpdateSchema, validationError } from '@/utils/validation-schemas';

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

  // Processar deletados
  if (deletes && Array.isArray(deletes) && deletes.length > 0) {
    for (const itemId of deletes) {
      try {
        const item = await prisma.cashflowItem.findFirst({
          where: {
            id: itemId,
            userId: targetUserId, // Só pode deletar itens do usuário
          },
        });

        if (item) {
          // Deletar valores e item em uma única transação
          await prisma.$transaction([
            prisma.cashflowValue.deleteMany({ where: { itemId } }),
            prisma.cashflowItem.delete({ where: { id: itemId } }),
          ]);

          results.push({ itemId, success: true });
        } else {
          results.push({ itemId, success: false, error: 'Item não encontrado' });
        }
      } catch (error) {
        console.error(`Erro ao deletar item ${itemId}:`, error);
        results.push({ itemId, success: false, error: 'Erro ao deletar' });
      }
    }
  }

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

        // Atualizar campos do item
        const itemUpdateData: {
          name?: string;
          significado?: string | null;
          rank?: string | null;
        } = {};

        if (name !== undefined) itemUpdateData.name = name;
        if (significado !== undefined) itemUpdateData.significado = significado;
        if (rank !== undefined) itemUpdateData.rank = rank;

        if (Object.keys(itemUpdateData).length > 0) {
          await prisma.cashflowItem.update({
            where: { id: finalItemId },
            data: itemUpdateData,
          });
        }

        // Atualizar valores mensais
        if (values && Array.isArray(values) && values.length > 0) {
          for (const { month, value, color } of values) {
            if (typeof month !== 'number' || month < 0 || month > 11) {
              continue; // Ignorar meses inválidos
            }

            const existingValue = await prisma.cashflowValue.findFirst({
              where: {
                itemId: finalItemId,
                userId: targetUserId,
                year: currentYear,
                month,
              },
            });

            const numericValue = parseFloat(value.toString());
            if (!Number.isFinite(numericValue)) {
              continue; // Ignorar valores inválidos
            }

            const updateData: {
              value: number;
              color?: string | null;
            } = {
              value: numericValue,
            };

            // Incluir cor se fornecida
            if (color !== undefined) {
              updateData.color = color;
            }

            if (existingValue) {
              // Atualizar valor existente
              await prisma.cashflowValue.update({
                where: { id: existingValue.id },
                data: updateData,
              });
            } else {
              // Criar novo valor
              await prisma.cashflowValue.create({
                data: {
                  itemId: finalItemId,
                  userId: targetUserId,
                  year: currentYear,
                  month,
                  value: numericValue,
                  color: color !== undefined ? color : null,
                },
              });
            }
          }
        }

        results.push({ itemId, success: true });
      } catch (error) {
        console.error(`Erro ao atualizar item ${update.itemId}:`, error);
        results.push({
          itemId: update.itemId || '',
          success: false,
          error: 'Erro ao atualizar',
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    results,
    message: 'Alterações salvas com sucesso',
  });
});
