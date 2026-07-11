import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { recordChange } from '@/services/changeHistory';
import { assertUndoable, UndoError } from '@/services/changeHistory/undo';

/**
 * POST /api/historico-alteracoes/:id/undo — desfaz uma alteração do histórico.
 *
 * Fluxo: valida dono/estratégia/conflito LIFO → CLAIM atômico da entrada
 * (updateMany condicionado a undoneAt: null; count 0 = corrida perdida) →
 * executa a mutação inversa + efeitos colaterais → registra a entrada
 * `<action>.desfazer` apontando pra original via revertsId. Se o handler
 * falha, o claim é revertido — a entrada volta a ser desfazível.
 *
 * CSRF já validado no middleware; sob impersonation o consultor desfaz em
 * nome do cliente (viaConsultant/undoneById registram o ator real).
 */
export const POST = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await requireAuthWithActing(request);
    const { targetUserId } = auth;
    const { id } = await params;

    const entry = await prisma.userChangeLog.findFirst({
      where: { id, userId: targetUserId },
    });
    if (!entry) {
      return NextResponse.json({ error: 'Entrada de histórico não encontrada' }, { status: 404 });
    }

    let definition;
    try {
      definition = await assertUndoable(entry, targetUserId);
    } catch (error: unknown) {
      if (error instanceof UndoError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status },
        );
      }
      throw error;
    }

    // Claim-first: garante no-double-undo mesmo com requisições concorrentes.
    const claimed = await prisma.userChangeLog.updateMany({
      where: { id: entry.id, undoneAt: null },
      data: { undoneAt: new Date(), undoneById: auth.payload.id },
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: 'Esta alteração já foi desfeita', code: 'ALREADY_UNDONE' },
        { status: 409 },
      );
    }

    let outcome;
    try {
      outcome = await definition.execute({ request, auth, entry });
    } catch (error: unknown) {
      // Rollback do claim — a mutação inversa não aconteceu.
      await prisma.userChangeLog.updateMany({
        where: { id: entry.id },
        data: { undoneAt: null, undoneById: null },
      });
      if (error instanceof UndoError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status },
        );
      }
      throw error;
    }

    await recordChange({
      request,
      auth,
      section: entry.section as Parameters<typeof recordChange>[0]['section'],
      action: `${entry.action}.desfazer`,
      entity: entry.entity ?? undefined,
      entityId: entry.entityId ?? undefined,
      entityLabel: outcome.entityLabel ?? entry.entityLabel ?? undefined,
      changes: outcome.changes,
      revertsId: entry.id,
    });

    return NextResponse.json({ success: true, section: entry.section });
  },
);
