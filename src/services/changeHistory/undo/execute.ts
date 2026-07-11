import type { UserChangeLog } from '@prisma/client';
import prisma from '@/lib/prisma';
import { UNDO_REGISTRY } from './registry';
import { getChanges, getSnapshot } from './helpers';
import { UndoError, type UndoDefinition } from './types';

/**
 * Validação AUTORITATIVA de que a entrada pode ser desfeita (a rota chama
 * antes do claim; o canUndo do GET é só a versão em lote pra UI).
 * Lança UndoError com status/código/mensagem legível.
 */
export async function assertUndoable(
  entry: UserChangeLog,
  userId: string,
): Promise<UndoDefinition> {
  if (entry.revertsId) {
    throw new UndoError(400, 'Não é possível desfazer um "desfazer"', 'UNDO_NOT_SUPPORTED');
  }
  const def = UNDO_REGISTRY[entry.action];
  if (!def) {
    throw new UndoError(400, 'Esta ação não pode ser desfeita', 'UNDO_NOT_SUPPORTED');
  }
  if (
    (def.requires.entityId && !entry.entityId) ||
    (def.requires.changes && getChanges(entry).length === 0) ||
    (def.requires.snapshot && !getSnapshot(entry)) ||
    (def.precheck && !def.precheck(entry))
  ) {
    throw new UndoError(
      400,
      'Este registro é anterior ao recurso de desfazer e não guarda os dados necessários',
      'UNDO_MISSING_DATA',
    );
  }

  // Conflito LIFO — mesma política do annotateCanUndo, para uma entrada só.
  const conflictWhere = entry.entityId
    ? { userId, entityId: entry.entityId, undoneAt: null, revertsId: null }
    : { userId, entityId: null, action: entry.action, undoneAt: null, revertsId: null };
  const newer = await prisma.userChangeLog.findFirst({
    where: { ...conflictWhere, createdAt: { gt: entry.createdAt } },
    select: { id: true },
  });
  if (newer) {
    throw new UndoError(
      409,
      'Há alterações mais recentes nesta entidade. Desfaça-as primeiro.',
      'UNDO_CONFLICT',
    );
  }
  return def;
}
