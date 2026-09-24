/**
 * POST /api/cashflow/item/move — move uma linha do fluxo de caixa para OUTRO
 * grupo/seção (drag-and-drop livre, pedido do Pedro 24/09/2026). Dentro do
 * mesmo grupo o front usa `/api/cashflow/item/reorder`.
 *
 * Recebe o item, o grupo de destino e a lista COMPLETA de ids do destino na
 * nova ordem (já com o item movido). Templates são personalizados (item e
 * grupo de destino), o item passa a morar no grupo de destino — levando os
 * valores de todos os anos, que são do item — e o destino recebe orderIndex
 * por posição. O merge (getCashflowTree) exibe o override no grupo real.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError, zString } from '@/utils/validation-schemas';
import { personalizeGroup, personalizeItem } from '@/utils/cashflowPersonalization';
import { getUserCashflowStructure } from '@/utils/cashflowSetup';
import { recordChange } from '@/services/changeHistory';

const moveSchema = z.object({
  itemId: zString(255),
  toGroupId: zString(255),
  itemIds: z.array(zString(255)).min(1).max(300),
});

interface TreeItem {
  id: string;
  userId: string | null;
}
interface TreeGroup {
  id: string;
  name: string;
  type: string;
  userId: string | null;
  items?: TreeItem[];
  children?: TreeGroup[];
}

/** Grupos de lançamento manual: os calculados (investimento/saldo) não recebem linhas. */
const TIPOS_DESTINO = new Set(['entrada', 'despesa']);

function findGroup(groups: TreeGroup[], groupId: string): TreeGroup | null {
  for (const g of groups) {
    if (g.id === groupId) return g;
    const found = findGroup(g.children ?? [], groupId);
    if (found) return found;
  }
  return null;
}

function findGroupOfItem(groups: TreeGroup[], itemId: string): TreeGroup | null {
  for (const g of groups) {
    if ((g.items ?? []).some((i) => i.id === itemId)) return g;
    const found = findGroupOfItem(g.children ?? [], itemId);
    if (found) return found;
  }
  return null;
}

/**
 * Cópia antiga (clone físico sem templateId) casa com o template só pelo nome
 * dentro do override do grupo. Ao sair do grupo esse casamento some e a linha
 * do template reapareceria vazia na origem — então fecha o vínculo antes,
 * como o personalizeItem já faz no back-compat.
 */
async function linkLegacyClone(itemId: string, name: string, groupId: string, userId: string) {
  const grupo = await prisma.cashflowGroup.findFirst({
    where: { id: groupId, userId },
    select: { templateId: true },
  });
  if (!grupo?.templateId) return;
  const tplItem = await prisma.cashflowItem.findFirst({
    where: { groupId: grupo.templateId, userId: null, name },
    select: { id: true },
  });
  if (!tplItem) return;
  const jaTemOverride = await prisma.cashflowItem.findFirst({
    where: { userId, templateId: tplItem.id },
    select: { id: true },
  });
  if (jaTemOverride) return;
  await prisma.cashflowItem.update({ where: { id: itemId }, data: { templateId: tplItem.id } });
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { targetUserId } = auth;

  const parsed = moveSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { itemId, toGroupId, itemIds } = parsed.data;

  // Validação sobre a árvore MESCLADA (a mesma que o usuário vê): ids do
  // merge, grupos ocultos fora, template × override já resolvidos.
  const tree = (await getUserCashflowStructure(targetUserId)) as TreeGroup[];
  const origem = findGroupOfItem(tree, itemId);
  const destino = findGroup(tree, toGroupId);
  if (!origem || !destino) {
    return NextResponse.json({ error: 'Linha ou grupo não encontrado' }, { status: 404 });
  }
  if (origem.id === destino.id) {
    return NextResponse.json(
      { error: 'A linha já está nesse grupo — use a reordenação' },
      { status: 400 },
    );
  }
  if (!TIPOS_DESTINO.has(destino.type)) {
    return NextResponse.json(
      { error: 'Esse grupo é calculado e não recebe linhas' },
      { status: 400 },
    );
  }

  const row = await prisma.cashflowItem.findFirst({
    where: { id: itemId, OR: [{ userId: targetUserId }, { userId: null }] },
    select: {
      id: true,
      userId: true,
      name: true,
      groupId: true,
      templateId: true,
      objetivoId: true,
      dividaId: true,
    },
  });
  if (!row) {
    return NextResponse.json({ error: 'Linha não encontrada' }, { status: 404 });
  }
  // Espelhos de sonho/dívida são sincronizados pelo grupo onde nasceram.
  if (row.objetivoId || row.dividaId) {
    return NextResponse.json(
      { error: 'Linha vinculada a um sonho ou dívida não muda de seção' },
      { status: 400 },
    );
  }

  const itensDestino = new Map((destino.items ?? []).map((i) => [i.id, i]));
  const idsUnicos = new Set(itemIds);
  const listaValida =
    idsUnicos.size === itemIds.length &&
    idsUnicos.has(itemId) &&
    itemIds.every((id) => id === itemId || itensDestino.has(id)) &&
    itemIds.length === itensDestino.size + 1;
  if (!listaValida) {
    return NextResponse.json({ error: 'Lista de linhas do destino inválida' }, { status: 400 });
  }

  // Personaliza fora da $transaction (as funções têm as próprias). Grupo de
  // destino template → override dele (copia os itens do template, então os
  // ids do destino também são resolvidos pro override logo abaixo).
  const finalItemId = row.userId === null ? await personalizeItem(itemId, targetUserId) : itemId;
  if (row.userId !== null && row.templateId === null) {
    await linkLegacyClone(row.id, row.name, row.groupId, targetUserId);
  }
  const finalGroupId =
    destino.userId === null ? await personalizeGroup(destino.id, targetUserId) : destino.id;

  const finalIds: string[] = [];
  for (const id of itemIds) {
    if (id === itemId) {
      finalIds.push(finalItemId);
      continue;
    }
    const it = itensDestino.get(id)!;
    finalIds.push(it.userId === null ? await personalizeItem(id, targetUserId) : id);
  }

  await prisma.$transaction([
    prisma.cashflowItem.update({ where: { id: finalItemId }, data: { groupId: finalGroupId } }),
    ...finalIds.map((id, index) =>
      prisma.cashflowItem.update({ where: { id }, data: { orderIndex: index + 1 } }),
    ),
  ]);

  await recordChange({
    request,
    auth,
    section: 'fluxo-caixa',
    action: 'item.mover',
    entity: 'item',
    entityId: finalItemId,
    entityLabel: row.name,
    changes: [
      { field: 'grupo', label: 'Grupo', before: origem.name, after: destino.name, format: 'text' },
    ],
  });

  return NextResponse.json({
    success: true,
    itemId: finalItemId,
    groupId: finalGroupId,
    itemIds: finalIds,
  });
});
