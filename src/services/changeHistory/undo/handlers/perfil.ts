/**
 * Handlers de undo — seção PERFIL.
 *
 * Só o NOME é restaurável. E-mail nunca (unicidade + fluxos de verificação);
 * senha/2FA nunca entram no registry (reverter credenciais pelo histórico é
 * vetor de ataque em sessão roubada).
 */

import prisma from '@/lib/prisma';
import { UndoError, type UndoContext, type UndoDefinition, type UndoOutcome } from '../types';
import { assertCurrentMatchesAfter, getChanges, invertChanges } from '../helpers';

const perfilEditar: UndoDefinition = {
  strategy: 'restore-fields',
  requires: { changes: true },
  // Diff só com e-mail (ou avatar) não é reversível — precisa tocar o nome.
  precheck: (entry) => getChanges(entry).some((c) => c.field === 'name'),
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const changes = getChanges(entry).filter((c) => c.field === 'name');
    const user = await prisma.user.findUnique({ where: { id: auth.targetUserId } });
    if (!user) throw new UndoError(409, 'Usuário não encontrado');

    assertCurrentMatchesAfter({ name: user.name }, changes);
    await prisma.user.update({
      where: { id: user.id },
      data: { name: changes[0].before as string },
    });
    return { changes: invertChanges(changes) };
  },
};

export const PERFIL_UNDO_HANDLERS: Record<string, UndoDefinition> = {
  'perfil.editar': perfilEditar,
};
