import type { UserChangeLog } from '@prisma/client';
import prisma from '@/lib/prisma';
import { UNDO_REGISTRY } from './registry';
import { getChanges, getSnapshot } from './helpers';
import type { UndoDefinition } from './types';

/**
 * Pré-requisitos satisfeitos olhando só a row (sem query): action registrada,
 * não desfeita, não é um undo, e os dados exigidos pela estratégia existem.
 */
export function rowLevelUndoable(entry: UserChangeLog): UndoDefinition | null {
  if (entry.undoneAt || entry.revertsId) return null;
  const def = UNDO_REGISTRY[entry.action];
  if (!def) return null;
  if (def.requires.entityId && !entry.entityId) return null;
  if (def.requires.changes && getChanges(entry).length === 0) return null;
  if (def.requires.snapshot && !getSnapshot(entry)) return null;
  if (def.precheck && !def.precheck(entry)) return null;
  return def;
}

/**
 * Política de conflito LIFO: só a entrada MAIS RECENTE não-desfeita de uma
 * entidade é desfazível — desfazer no meio da pilha produziria estados
 * inconsistentes. Para entradas sem entityId, o escopo do conflito é a
 * própria action (ex.: aposentadoria.editar antiga não pode ser desfeita se
 * houve outra edição depois).
 *
 * Uma query agregada por página (groupBy) — sem N+1.
 */
export async function annotateCanUndo(
  entries: UserChangeLog[],
  userId: string,
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const candidates = entries.filter((entry) => rowLevelUndoable(entry) !== null);
  for (const entry of entries) result.set(entry.id, false);
  if (candidates.length === 0) return result;

  const entityIds = [
    ...new Set(candidates.map((e) => e.entityId).filter((v): v is string => v !== null)),
  ];
  const actionsWithoutEntity = [
    ...new Set(candidates.filter((e) => e.entityId === null).map((e) => e.action)),
  ];

  const [byEntity, byAction] = await Promise.all([
    entityIds.length > 0
      ? prisma.userChangeLog.groupBy({
          by: ['entityId'],
          where: {
            userId,
            entityId: { in: entityIds },
            undoneAt: null,
            revertsId: null,
          },
          _max: { createdAt: true },
        })
      : Promise.resolve([] as Array<{ entityId: string | null; _max: { createdAt: Date | null } }>),
    actionsWithoutEntity.length > 0
      ? prisma.userChangeLog.groupBy({
          by: ['action'],
          where: {
            userId,
            entityId: null,
            action: { in: actionsWithoutEntity },
            undoneAt: null,
            revertsId: null,
          },
          _max: { createdAt: true },
        })
      : Promise.resolve([] as Array<{ action: string; _max: { createdAt: Date | null } }>),
  ]);

  const latestByEntity = new Map(
    byEntity.map((row) => [row.entityId as string, row._max.createdAt?.getTime() ?? 0]),
  );
  const latestByAction = new Map(
    byAction.map((row) => [row.action, row._max.createdAt?.getTime() ?? 0]),
  );

  for (const entry of candidates) {
    const latest = entry.entityId
      ? latestByEntity.get(entry.entityId)
      : latestByAction.get(entry.action);
    result.set(entry.id, latest !== undefined && entry.createdAt.getTime() >= latest);
  }
  return result;
}
