import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { personalizeItem, getItemForUser } from '@/utils/cashflowPersonalization';

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
 *     rank?: number | null,
 *     values?: Array<{ month: number; value: number; color?: string | null }>
 *   }>,
 *   deletes: string[]
 * }
 */
export async function PUT(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Token não fornecido' }, { status: 401 });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; email: string };
    const { groupId, updates, deletes } = await request.json();

    if (!groupId) {
      return NextResponse.json({ error: 'groupId é obrigatório' }, { status: 400 });
    }

    const currentYear = new Date().getFullYear();
    const results: Array<{ itemId: string; success: boolean; error?: string }> = [];

    // Processar deletados
    if (deletes && Array.isArray(deletes) && deletes.length > 0) {
      for (const itemId of deletes) {
        try {
          const item = await prisma.cashflowItem.findFirst({
            where: {
              id: itemId,
              userId: payload.id, // Só pode deletar itens do usuário
            },
          });

          if (item) {
            // Deletar valores associados
            await prisma.cashflowValue.deleteMany({
              where: { itemId },
            });

            // Deletar item
            await prisma.cashflowItem.delete({
              where: { id: itemId },
            });

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

          // Buscar item (pode ser template ou personalizado)
          const item = await getItemForUser(itemId, payload.id);
          if (!item) {
            results.push({ itemId, success: false, error: 'Item não encontrado' });
            continue;
          }

          // Se é template, criar cópia personalizada
          let finalItemId = item.id;
          if (item.userId === null) {
            finalItemId = await personalizeItem(item.id, payload.id);
          }

          // Atualizar campos do item
          const itemUpdateData: {
            name?: string;
            significado?: string | null;
            rank?: number | null;
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
                  userId: payload.id,
                  year: currentYear,
                  month,
                },
              });

              const updateData: {
                value: number;
                color?: string | null;
              } = {
                value: parseFloat(value.toString()),
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
                    userId: payload.id,
                    year: currentYear,
                    month,
                    value: parseFloat(value.toString()),
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
            error: 'Erro ao atualizar' 
          });
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      results,
      message: 'Alterações salvas com sucesso'
    });
  } catch (error) {
    console.error('Erro na API batch-update:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

