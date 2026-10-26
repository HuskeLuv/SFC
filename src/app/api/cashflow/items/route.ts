import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { personalizeGroup, getGroupForUser } from '@/utils/cashflowPersonalization';
import { cashflowItemCreateSchema, validationError } from '@/utils/validation-schemas';
import { recordChange, diffFields, CASHFLOW_FIELD_LABELS } from '@/services/changeHistory';
import {
  guardarCriacaoItemV2,
  usuarioOrcamentoV2Ativo,
} from '@/services/cashflow/orcamentoV2/guardas';

import { withErrorHandler } from '@/utils/apiErrorHandler';

// Migrada de jwt.verify artesanal (que virava 500 em token inválido) para
// requireAuthWithActing — consultor atuando cria o item PARA o cliente e o
// histórico registra ator (consultor) e dono (cliente) corretamente
// (auditoria 29/08/2026, achados 1.3/2.2).
export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { targetUserId } = auth;
  const body = await request.json();
  const parsed = cashflowItemCreateSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { groupId, descricao, name, significado } = parsed.data;

  // Validate input
  if (!descricao && !name) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  // Buscar grupo (pode ser template ou personalizado)
  const group = await getGroupForUser(groupId, targetUserId);
  if (!group) {
    return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 });
  }

  // Orçamento v2 (só usuário ativado): nada de linha solta em Despesas/Despesas Fixas (Q15, 409);
  // em categoria, nome único/1–60 (R-12/R-18, 422) e a sub nova entra antes da Geral. Antes de
  // personalizar, para a recusa não deixar override criado.
  let nomeFinal = (name || descricao)!;
  let orderIndex: number | undefined;
  if (await usuarioOrcamentoV2Ativo(targetUserId)) {
    ({ nome: nomeFinal, orderIndex } = await guardarCriacaoItemV2(
      targetUserId,
      groupId,
      nomeFinal,
    ));
  }

  // Se grupo é template, personalizar antes de adicionar item
  let finalGroupId = group.id;
  if (group.userId === null) {
    finalGroupId = await personalizeGroup(group.id, targetUserId);
  }

  // Get the highest rank in the group to set the new item's rank
  // Rank agora é texto, não precisa calcular
  const newRank = null;

  // Create the new item (sempre personalizado quando criado pelo usuário)
  const newItem = await prisma.cashflowItem.create({
    data: {
      userId: targetUserId, // Sempre personalizado quando criado pelo usuário
      name: nomeFinal,
      significado: significado || null,
      groupId: finalGroupId,
      rank: newRank,
      ...(orderIndex !== undefined && { orderIndex }),
    },
    include: {
      values: {
        where: { userId: targetUserId },
      },
    },
  });

  await recordChange({
    request,
    auth,
    section: 'fluxo-caixa',
    action: 'item.criar',
    entity: 'item',
    entityId: newItem.id,
    entityLabel: newItem.name,
    changes: diffFields({}, newItem, CASHFLOW_FIELD_LABELS),
  });

  return NextResponse.json(newItem);
});
