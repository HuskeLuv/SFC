/**
 * Handlers de undo — seção AGENDA (eventos manuais do calendário).
 *
 * O diff do histórico usa os campos do DTO (datas civis "AAAA-MM-DD",
 * ver camposDoEvento), então a checagem otimista compara com o evento
 * serializado e a restauração passa por paraPrisma.
 */
import prisma from '@/lib/prisma';
import { camposDoEvento, paraPrisma, type CamposEvento } from '@/services/calendario/eventoManual';
import { deDataCivil } from '@/services/calendario/datas';
import { UndoError, type UndoContext, type UndoDefinition, type UndoOutcome } from '../types';
import {
  assertCurrentMatchesAfter,
  getChanges,
  getSnapshot,
  invertChanges,
  isUniqueViolation,
  restoreData,
} from '../helpers';

const eventoCriar: UndoDefinition = {
  strategy: 'delete-created',
  requires: { entityId: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const evento = await prisma.event.findFirst({
      where: { id: entry.entityId!, userId: auth.targetUserId },
    });
    if (!evento) throw new UndoError(409, 'O evento não existe mais');
    await prisma.event.delete({ where: { id: evento.id } });
    return { changes: invertChanges(getChanges(entry)) };
  },
};

const eventoEditar: UndoDefinition = {
  strategy: 'restore-fields',
  requires: { entityId: true, changes: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const changes = getChanges(entry);
    const evento = await prisma.event.findFirst({
      where: { id: entry.entityId!, userId: auth.targetUserId },
    });
    if (!evento) throw new UndoError(409, 'O evento não existe mais');
    assertCurrentMatchesAfter(
      camposDoEvento(evento) as unknown as Record<string, unknown>,
      changes,
    );
    await prisma.event.update({
      where: { id: evento.id },
      data: paraPrisma(restoreData(changes) as Partial<CamposEvento>),
    });
    return { changes: invertChanges(changes) };
  },
};

const eventoExcluir: UndoDefinition = {
  strategy: 'recreate-from-snapshot',
  requires: { entityId: true, snapshot: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const snap = getSnapshot(entry)!;
    if (snap.kind !== 'evento') {
      throw new UndoError(400, 'Snapshot incompatível', 'UNDO_MISSING_DATA');
    }
    const d = snap.data as unknown as CamposEvento & { id: string };
    if (typeof d?.id !== 'string' || typeof d.titulo !== 'string' || typeof d.data !== 'string') {
      throw new UndoError(400, 'Snapshot sem os dados do evento', 'UNDO_MISSING_DATA');
    }
    try {
      await prisma.event.create({
        data: {
          id: d.id,
          userId: auth.targetUserId,
          title: d.titulo,
          description: d.descricao ?? null,
          date: deDataCivil(d.data),
          endDate: d.dataFim ? deDataCivil(d.dataFim) : null,
          hora: d.hora ?? null,
          categoria: d.categoria ?? 'pessoal',
          recorrencia: d.recorrencia ?? 'nenhuma',
          lembrete: Boolean(d.lembrete),
        },
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new UndoError(409, 'O evento já foi restaurado');
      throw error;
    }
    return { changes: invertChanges(getChanges(entry)) };
  },
};

export const CALENDARIO_UNDO_HANDLERS: Record<string, UndoDefinition> = {
  'evento.criar': eventoCriar,
  'evento.editar': eventoEditar,
  'evento.excluir': eventoExcluir,
};
