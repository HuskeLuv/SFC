/**
 * Handlers de undo — seção SAÚDE FINANCEIRA (seguros).
 *
 * Mais simples que dívidas: apólice não tem linha-espelho no fluxo de caixa
 * nem filhos — reverter é mexer só na própria row.
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

const seguroCriar: UndoDefinition = {
  strategy: 'delete-created',
  requires: { entityId: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const seguro = await prisma.seguroApolice.findFirst({
      where: { id: entry.entityId!, userId: auth.targetUserId },
    });
    if (!seguro) throw new UndoError(409, 'O seguro não existe mais');

    await prisma.seguroApolice.delete({ where: { id: seguro.id } });
    return { changes: invertChanges(getChanges(entry)) };
  },
};

const seguroEditar: UndoDefinition = {
  strategy: 'restore-fields',
  requires: { entityId: true, changes: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const changes = getChanges(entry);
    const seguro = await prisma.seguroApolice.findFirst({
      where: { id: entry.entityId!, userId: auth.targetUserId },
    });
    if (!seguro) throw new UndoError(409, 'O seguro não existe mais');

    assertCurrentMatchesAfter(seguro as unknown as Record<string, unknown>, changes);
    await prisma.seguroApolice.update({
      where: { id: seguro.id },
      data: restoreData(changes),
    });
    return { changes: invertChanges(changes) };
  },
};

const seguroExcluir: UndoDefinition = {
  strategy: 'recreate-from-snapshot',
  requires: { entityId: true, snapshot: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const snap = getSnapshot(entry)!;
    const data = snap.data as unknown as {
      id: string;
      nome: string;
      tipo: string;
      cobertura: string;
      risco: string;
      custoAnual: number;
      capitalSegurado: number | null;
      notes: string | null;
    };

    try {
      await prisma.seguroApolice.create({
        data: {
          id: data.id,
          userId: auth.targetUserId,
          nome: data.nome,
          tipo: data.tipo,
          cobertura: data.cobertura,
          risco: data.risco,
          custoAnual: data.custoAnual,
          capitalSegurado: data.capitalSegurado,
          notes: data.notes,
        },
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new UndoError(409, 'O seguro já foi restaurado');
      throw error;
    }
    return { changes: invertChanges(getChanges(entry)), entityLabel: data.nome };
  },
};

export const SAUDE_FINANCEIRA_UNDO_HANDLERS: Record<string, UndoDefinition> = {
  'seguro.criar': seguroCriar,
  'seguro.editar': seguroEditar,
  'seguro.excluir': seguroExcluir,
};
