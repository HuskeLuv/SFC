/**
 * Handlers de undo — Orçamento v2 (desenho técnico §6.2/§6.3).
 *
 * 'orcamento.subcategoria.excluir': desfaz a fusão de `excluirSubcategoria` pelo snapshot, numa
 * transação só (tudo ou nada):
 *  1. o item volta: lápide de override/legado → `hidden=false` (e o `templateId` original);
 *     lápide nova de item-template → apagada; linha só do usuário → recriada com o mesmo id;
 *  2. células movidas voltam para a sub (pelo id); células somadas: a da Geral volta ao estado
 *     de antes e a da sub é recriada — só se a da Geral ainda vale o que a fusão gravou;
 *  3. transações do banco que ainda estão na Geral voltam para a sub;
 *  4. orçados: os da Geral voltam ao anterior (se ainda valem o somado) e os da sub são recriados.
 * Qualquer mudança posterior nos alvos → 409 (STATE_MISMATCH), sem desfazer nada pela metade.
 */
import prisma from '@/lib/prisma';
import { recomputeEvolucaoSnapshotsSafe } from '@/services/cashflow/evolucaoPatrimonioServer';
import type { DadosSnapshotExclusao } from '@/services/cashflow/orcamentoV2/excluirSubcategoria';
import {
  ACAO_EXCLUIR_SUBCATEGORIA,
  KIND_SNAPSHOT_EXCLUSAO,
} from '@/services/cashflow/orcamentoV2/excluirSubcategoria';
import {
  STATE_MISMATCH_MESSAGE,
  UndoError,
  type UndoContext,
  type UndoDefinition,
  type UndoOutcome,
} from '../types';
import { getChanges, getSnapshot, invertChanges, isUniqueViolation, valuesMatch } from '../helpers';

const conflito = () => new UndoError(409, STATE_MISMATCH_MESSAGE);

const subcategoriaExcluir: UndoDefinition = {
  strategy: 'custom',
  requires: { entityId: true, snapshot: true },
  precheck(entry) {
    return getSnapshot(entry)?.kind === KIND_SNAPSHOT_EXCLUSAO;
  },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const { targetUserId: userId } = auth;
    const snap = getSnapshot(entry);
    if (!snap || snap.kind !== KIND_SNAPSHOT_EXCLUSAO) {
      throw new UndoError(400, 'Snapshot incompatível', 'UNDO_MISSING_DATA');
    }
    const d = snap.data as unknown as DadosSnapshotExclusao;
    if (!d?.item?.id || !d.geralId || !Array.isArray(d.celulasMovidas)) {
      throw new UndoError(400, 'Snapshot sem os dados da fusão', 'UNDO_MISSING_DATA');
    }
    const itemId = d.item.id;

    await prisma.$transaction(async (tx) => {
      const geral = await tx.cashflowItem.findFirst({
        where: { id: d.geralId, userId },
        select: { id: true },
      });
      if (!geral) throw new UndoError(409, 'A subcategoria Geral não existe mais');

      // 1) Item
      if (d.modo === 'apagado') {
        try {
          await tx.cashflowItem.create({
            data: {
              id: itemId,
              userId,
              groupId: d.item.groupId,
              name: d.item.name,
              significado: d.item.significado,
              rank: d.item.rank,
              orderIndex: d.item.orderIndex,
              templateId: d.item.templateId,
              orcamentoFixa: d.item.orcamentoFixa,
            },
          });
        } catch (error: unknown) {
          if (isUniqueViolation(error))
            throw new UndoError(409, 'A subcategoria já foi restaurada');
          throw error;
        }
      } else if (d.modo === 'ocultado') {
        const lapide = await tx.cashflowItem.findFirst({ where: { id: itemId, userId } });
        if (!lapide) throw new UndoError(409, 'A subcategoria não existe mais');
        if (!lapide.hidden) throw new UndoError(409, 'A subcategoria já foi restaurada');
        await tx.cashflowItem.update({
          where: { id: itemId },
          data: { hidden: false, templateId: d.item.templateId },
        });
      } else {
        const lapide = d.tombstoneId
          ? await tx.cashflowItem.findFirst({ where: { id: d.tombstoneId, userId } })
          : null;
        if (!lapide?.hidden) throw new UndoError(409, 'A linha oculta não existe mais');
        await tx.cashflowItem.delete({ where: { id: lapide.id } });
      }

      // 2) Células
      if (d.celulasMovidas.length > 0) {
        const r = await tx.cashflowValue.updateMany({
          where: { id: { in: d.celulasMovidas }, itemId: d.geralId, userId },
          data: { itemId },
        });
        if (r.count !== d.celulasMovidas.length) throw conflito();
      }
      for (const c of d.celulasSomadas ?? []) {
        const atual = await tx.cashflowValue.findFirst({
          where: { itemId: d.geralId, userId, year: c.ano, month: c.mes },
        });
        if (
          !atual ||
          !valuesMatch(atual.value, c.geralDepois.value) ||
          !valuesMatch(atual.valorBanco, c.geralDepois.valorBanco)
        ) {
          throw conflito();
        }
        await tx.cashflowValue.update({ where: { id: atual.id }, data: { ...c.geralAntes } });
        await tx.cashflowValue.create({
          data: { itemId, userId, year: c.ano, month: c.mes, ...c.sub },
        });
      }

      // 3) Transações do banco (as que ainda estão na Geral)
      if ((d.transacoes ?? []).length > 0) {
        await tx.bankTransaction.updateMany({
          where: { id: { in: d.transacoes }, userId, cashflowItemId: d.geralId },
          data: { cashflowItemId: itemId },
        });
      }

      // 4) Orçados
      for (const o of d.orcadosGeral ?? []) {
        const atual = await tx.cashflowOrcamentoItem.findFirst({
          where: { userId, itemId: d.geralId, ano: o.ano, mes: o.mes },
        });
        if (!atual || atual.pct != null || !valuesMatch(atual.valor, o.depois)) throw conflito();
        if (o.antes === null) {
          await tx.cashflowOrcamentoItem.delete({ where: { id: atual.id } });
        } else {
          await tx.cashflowOrcamentoItem.update({
            where: { id: atual.id },
            data: { valor: o.antes.valor, pct: o.antes.pct },
          });
        }
      }
      if ((d.orcadosSub ?? []).length > 0) {
        await tx.cashflowOrcamentoItem.createMany({
          data: d.orcadosSub.map((o) => ({
            userId,
            itemId,
            ano: o.ano,
            mes: o.mes,
            valor: o.valor,
            pct: o.pct,
          })),
        });
      }
    });

    await recomputeEvolucaoSnapshotsSafe(userId, new Date(0));
    return { changes: invertChanges(getChanges(entry)) };
  },
};

export const ORCAMENTO_V2_UNDO_HANDLERS: Record<string, UndoDefinition> = {
  [ACAO_EXCLUIR_SUBCATEGORIA]: subcategoriaExcluir,
};
