/**
 * Handlers de undo — seção FLUXO DE CAIXA.
 *
 * A camada de override (template → override/tombstone) é revertida pelo que
 * o snapshot registrou que ACONTECEU, não pelo payload original:
 * - tombstone criado → desfazer = deletar o tombstone
 * - edição (inclusive a que criou override) → restaurar os campos anteriores
 * - row do usuário apagada → recriar com o id original (+ valores)
 */

import prisma from '@/lib/prisma';
import { UndoError, type UndoContext, type UndoDefinition, type UndoOutcome } from '../types';
import {
  assertCurrentMatchesAfter,
  getChanges,
  getSnapshot,
  invertChanges,
  isUniqueViolation,
  restoreData,
} from '../helpers';

const ITEM_FIELDS = new Set(['name', 'significado', 'rank']);
const GRUPO_FIELDS = new Set(['name', 'type']);
const LANCAMENTO_DATE_FIELDS = new Set(['data']);

interface CellLocator {
  itemId: string;
  year: number;
  month: number;
}

function cellLocator(meta: Record<string, unknown> | undefined): CellLocator {
  const itemId = meta?.itemId;
  const year = meta?.year;
  const month = meta?.month;
  if (typeof itemId !== 'string' || typeof year !== 'number' || typeof month !== 'number') {
    throw new UndoError(400, 'Snapshot sem localizador da célula', 'UNDO_MISSING_DATA');
  }
  return { itemId, year, month };
}

/** valor.editar cobre 2 alvos: célula (snapshot cashflow-valor) e campos do item. */
const valorEditar: UndoDefinition = {
  strategy: 'custom',
  requires: { entityId: true, changes: true },
  precheck(entry) {
    const snap = getSnapshot(entry);
    if (snap?.kind === 'cashflow-valor') return true;
    // Sem snapshot só é reversível quando o diff toca apenas campos do item
    // (edições de célula pré-deploy não guardam o locator ano×mês).
    return getChanges(entry).every((c) => ITEM_FIELDS.has(c.field));
  },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const { targetUserId } = auth;
    const changes = getChanges(entry);
    const snap = getSnapshot(entry);

    if (snap?.kind === 'cashflow-valor') {
      const { itemId, year, month } = cellLocator(snap.meta);
      const previousValue = (snap.data as { value: number | null }).value;

      const current = await prisma.cashflowValue.findFirst({
        where: { itemId, userId: targetUserId, year, month },
      });
      assertCurrentMatchesAfter(
        { monthlyValue: current ? Number(current.value) : null },
        changes.filter((c) => c.field === 'monthlyValue'),
      );

      if (previousValue === null) {
        // A célula não existia antes — desfazer = remover a row.
        if (current) await prisma.cashflowValue.delete({ where: { id: current.id } });
      } else if (current) {
        await prisma.cashflowValue.update({
          where: { id: current.id },
          data: { value: previousValue },
        });
      } else {
        await prisma.cashflowValue.create({
          data: { itemId, userId: targetUserId, year, month, value: previousValue },
        });
      }
      return { changes: invertChanges(changes) };
    }

    // Campos do item (name/significado/rank)
    const item = await prisma.cashflowItem.findFirst({
      where: { id: entry.entityId!, userId: targetUserId },
    });
    if (!item) throw new UndoError(409, 'O item não existe mais');
    assertCurrentMatchesAfter(item as unknown as Record<string, unknown>, changes);
    await prisma.cashflowItem.update({ where: { id: item.id }, data: restoreData(changes) });
    return { changes: invertChanges(changes) };
  },
};

const comentarioEditar: UndoDefinition = {
  strategy: 'custom',
  requires: { entityId: true, changes: true, snapshot: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const { targetUserId } = auth;
    const changes = getChanges(entry);
    const snap = getSnapshot(entry)!;
    const { itemId, year, month } = cellLocator(snap.meta);
    const previousComment = (snap.data as { comment: string | null }).comment;

    const current = await prisma.cashflowValue.findFirst({
      where: { itemId, userId: targetUserId, year, month },
    });
    if (!current) throw new UndoError(409, 'A célula do comentário não existe mais');
    assertCurrentMatchesAfter(
      { comment: current.comment ?? null },
      changes.filter((c) => c.field === 'comment'),
    );

    await prisma.cashflowValue.update({
      where: { id: current.id },
      data: { comment: previousComment },
    });
    return { changes: invertChanges(changes) };
  },
};

const itemCriar: UndoDefinition = {
  strategy: 'delete-created',
  requires: { entityId: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const item = await prisma.cashflowItem.findFirst({
      where: { id: entry.entityId!, userId: auth.targetUserId },
    });
    if (!item) throw new UndoError(409, 'O item não existe mais');
    if (item.objetivoId) {
      throw new UndoError(409, 'Esta linha espelha um sonho — exclua o sonho no Planejamento');
    }
    await prisma.$transaction([
      prisma.cashflowValue.deleteMany({ where: { itemId: item.id } }),
      prisma.cashflowItem.delete({ where: { id: item.id } }),
    ]);
    return { changes: invertChanges(getChanges(entry)) };
  },
};

/** Edição de item/grupo (inclusive a que criou override): restaura campos. */
const itemEditar: UndoDefinition = {
  strategy: 'restore-fields',
  requires: { entityId: true, changes: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const changes = getChanges(entry).filter((c) => ITEM_FIELDS.has(c.field));
    if (changes.length === 0) {
      throw new UndoError(400, 'Diff sem campos restauráveis', 'UNDO_MISSING_DATA');
    }
    const item = await prisma.cashflowItem.findFirst({
      where: { id: entry.entityId!, userId: auth.targetUserId },
    });
    if (!item) throw new UndoError(409, 'O item não existe mais');
    assertCurrentMatchesAfter(item as unknown as Record<string, unknown>, changes);
    await prisma.cashflowItem.update({ where: { id: item.id }, data: restoreData(changes) });
    return { changes: invertChanges(changes) };
  },
};

const grupoEditar: UndoDefinition = {
  strategy: 'restore-fields',
  requires: { entityId: true, changes: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const changes = getChanges(entry).filter((c) => GRUPO_FIELDS.has(c.field));
    if (changes.length === 0) {
      throw new UndoError(400, 'Diff sem campos restauráveis', 'UNDO_MISSING_DATA');
    }
    const group = await prisma.cashflowGroup.findFirst({
      where: { id: entry.entityId!, userId: auth.targetUserId },
    });
    if (!group) throw new UndoError(409, 'O grupo não existe mais');
    assertCurrentMatchesAfter(group as unknown as Record<string, unknown>, changes);
    await prisma.cashflowGroup.update({ where: { id: group.id }, data: restoreData(changes) });
    return { changes: invertChanges(changes) };
  },
};

const grupoCriar: UndoDefinition = {
  strategy: 'delete-created',
  requires: { entityId: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const { targetUserId } = auth;
    const group = await prisma.cashflowGroup.findFirst({
      where: { id: entry.entityId!, userId: targetUserId },
    });
    if (!group) throw new UndoError(409, 'O grupo não existe mais');

    const [children, items] = await Promise.all([
      prisma.cashflowGroup.count({ where: { parentId: group.id, userId: targetUserId } }),
      prisma.cashflowItem.count({ where: { groupId: group.id, userId: targetUserId } }),
    ]);
    if (children > 0 || items > 0) {
      throw new UndoError(409, 'O grupo já tem itens ou subgrupos — exclua-os primeiro');
    }
    await prisma.cashflowGroup.delete({ where: { id: group.id } });
    return { changes: invertChanges(getChanges(entry)) };
  },
};

const itemExcluir: UndoDefinition = {
  strategy: 'recreate-from-snapshot',
  requires: { entityId: true, snapshot: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const { targetUserId } = auth;
    const snap = getSnapshot(entry)!;

    // Caso tombstone: o "excluir" só criou uma linha oculta — deletá-la
    // ressuscita o template.
    if (snap.kind === 'cashflow-item-tombstone') {
      const tombstoneId = (snap.meta as { tombstoneId?: string } | undefined)?.tombstoneId;
      if (!tombstoneId) throw new UndoError(400, 'Snapshot sem tombstone', 'UNDO_MISSING_DATA');
      const tombstone = await prisma.cashflowItem.findFirst({
        where: { id: tombstoneId, userId: targetUserId },
      });
      if (!tombstone) throw new UndoError(409, 'A linha oculta não existe mais');
      await prisma.cashflowItem.delete({ where: { id: tombstone.id } });
      return { changes: invertChanges(getChanges(entry)) };
    }

    if (snap.kind !== 'cashflow-item') {
      throw new UndoError(400, 'Snapshot incompatível', 'UNDO_MISSING_DATA');
    }
    const data = snap.data as unknown as {
      id: string;
      groupId: string;
      name: string;
      significado: string | null;
      rank: string | null;
      templateId: string | null;
      hidden: boolean;
      objetivoId: string | null;
    };
    const meta = (snap.meta ?? {}) as {
      values?: Array<{
        year: number;
        month: number;
        value: number;
        comment: string | null;
        color: string | null;
      }>;
      valuesTruncated?: boolean;
    };
    if (meta.valuesTruncated) {
      throw new UndoError(
        400,
        'O item tinha valores demais para guardar — não é possível desfazer',
        'UNDO_MISSING_DATA',
      );
    }

    const group = await prisma.cashflowGroup.findUnique({ where: { id: data.groupId } });
    if (!group) throw new UndoError(409, 'O grupo do item não existe mais');

    // Linha-espelho de sonho: só re-linka se o sonho ainda existe e não ganhou
    // outra linha (unique objetivoId); senão degrada pra item comum.
    let objetivoId: string | null = null;
    if (data.objetivoId) {
      const [sonho, mirror] = await Promise.all([
        prisma.planejamentoObjetivo.findUnique({ where: { id: data.objetivoId } }),
        prisma.cashflowItem.findUnique({ where: { objetivoId: data.objetivoId } }),
      ]);
      if (sonho && !mirror) objetivoId = data.objetivoId;
    }

    try {
      await prisma.cashflowItem.create({
        data: {
          id: data.id,
          userId: targetUserId,
          groupId: data.groupId,
          name: data.name,
          significado: data.significado,
          rank: data.rank,
          templateId: data.templateId,
          hidden: data.hidden,
          objetivoId,
        },
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new UndoError(409, 'O item já foi restaurado');
      throw error;
    }
    if (meta.values && meta.values.length > 0) {
      await prisma.cashflowValue.createMany({
        data: meta.values.map((v) => ({
          itemId: data.id,
          userId: targetUserId,
          year: v.year,
          month: v.month,
          value: v.value,
          comment: v.comment,
          color: v.color,
        })),
      });
    }
    return { changes: invertChanges(getChanges(entry)) };
  },
};

const grupoExcluir: UndoDefinition = {
  strategy: 'recreate-from-snapshot',
  requires: { entityId: true, snapshot: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const { targetUserId } = auth;
    const snap = getSnapshot(entry)!;

    if (snap.kind === 'cashflow-grupo-tombstone') {
      const tombstoneId = (snap.meta as { tombstoneId?: string } | undefined)?.tombstoneId;
      if (!tombstoneId) throw new UndoError(400, 'Snapshot sem tombstone', 'UNDO_MISSING_DATA');
      const tombstone = await prisma.cashflowGroup.findFirst({
        where: { id: tombstoneId, userId: targetUserId },
      });
      if (!tombstone) throw new UndoError(409, 'A linha oculta não existe mais');
      await prisma.cashflowGroup.delete({ where: { id: tombstone.id } });
      return { changes: invertChanges(getChanges(entry)) };
    }

    if (snap.kind !== 'cashflow-grupo') {
      throw new UndoError(400, 'Snapshot incompatível', 'UNDO_MISSING_DATA');
    }
    const data = snap.data as unknown as {
      id: string;
      name: string;
      type: string;
      orderIndex: number | null;
      parentId: string | null;
      templateId: string | null;
      hidden: boolean;
    };

    if (data.parentId) {
      const parent = await prisma.cashflowGroup.findUnique({ where: { id: data.parentId } });
      if (!parent) throw new UndoError(409, 'O grupo-pai não existe mais');
    }

    try {
      await prisma.cashflowGroup.create({
        data: {
          id: data.id,
          userId: targetUserId,
          name: data.name,
          type: data.type,
          orderIndex: data.orderIndex ?? 0,
          parentId: data.parentId,
          templateId: data.templateId,
          hidden: data.hidden,
        },
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new UndoError(409, 'O grupo já foi restaurado');
      throw error;
    }
    return { changes: invertChanges(getChanges(entry)) };
  },
};

const lancamentoEditar: UndoDefinition = {
  strategy: 'restore-fields',
  requires: { entityId: true, changes: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const changes = getChanges(entry);
    const lancamento = await prisma.cashflow.findFirst({
      where: { id: entry.entityId!, userId: auth.targetUserId },
    });
    if (!lancamento) throw new UndoError(409, 'O lançamento não existe mais');
    assertCurrentMatchesAfter(lancamento as unknown as Record<string, unknown>, changes);
    await prisma.cashflow.update({
      where: { id: lancamento.id },
      data: restoreData(changes, LANCAMENTO_DATE_FIELDS),
    });
    return { changes: invertChanges(changes) };
  },
};

const lancamentoExcluir: UndoDefinition = {
  strategy: 'recreate-from-snapshot',
  requires: { entityId: true, snapshot: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const snap = getSnapshot(entry)!;
    const data = snap.data as unknown as {
      id: string;
      data: string;
      tipo: string;
      categoria: string;
      descricao: string;
      valor: number;
      forma_pagamento: string;
      pago: boolean;
    };
    try {
      await prisma.cashflow.create({
        data: {
          id: data.id,
          userId: auth.targetUserId,
          data: new Date(data.data),
          tipo: data.tipo,
          categoria: data.categoria,
          descricao: data.descricao,
          valor: data.valor,
          forma_pagamento: data.forma_pagamento,
          pago: data.pago,
        },
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new UndoError(409, 'O lançamento já foi restaurado');
      throw error;
    }
    return { changes: invertChanges(getChanges(entry)) };
  },
};

export const FLUXO_CAIXA_UNDO_HANDLERS: Record<string, UndoDefinition> = {
  'valor.editar': valorEditar,
  'comentario.editar': comentarioEditar,
  'item.criar': itemCriar,
  'item.editar': itemEditar,
  'item.excluir': itemExcluir,
  'grupo.criar': grupoCriar,
  'grupo.editar': grupoEditar,
  'grupo.excluir': grupoExcluir,
  'lancamento.editar': lancamentoEditar,
  'lancamento.excluir': lancamentoExcluir,
};
