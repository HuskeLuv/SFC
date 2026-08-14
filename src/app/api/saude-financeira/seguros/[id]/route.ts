/**
 * Seguros / Gestão de Risco (recurso individual).
 *
 * PATCH  /api/saude-financeira/seguros/:id  → edita campos parciais
 * DELETE /api/saude-financeira/seguros/:id  → remove
 *
 * 404 sempre que a apólice não pertence ao user (blindagem — mesmo padrão
 * das Dívidas).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { seguroPatchSchema, validationError } from '@/utils/validation-schemas';
import {
  recordChange,
  diffFields,
  finalStateChanges,
  SEGURO_FIELD_LABELS,
} from '@/services/changeHistory';
import { serializeSeguro } from '../_lib/serializer';

async function findOwned(id: string, userId: string) {
  return prisma.seguroApolice.findFirst({ where: { id, userId } });
}

export const PATCH = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await requireAuthWithActing(request);
    const { targetUserId } = auth;
    const { id } = await params;

    const existing = await findOwned(id, targetUserId);
    if (!existing) {
      return NextResponse.json({ error: 'Seguro não encontrado' }, { status: 404 });
    }

    const parsed = seguroPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return validationError(parsed);
    }

    const updated = await prisma.seguroApolice.update({
      where: { id },
      data: parsed.data,
    });

    await recordChange({
      request,
      auth,
      section: 'saude-financeira',
      action: 'seguro.editar',
      entity: 'seguro',
      entityId: id,
      entityLabel: updated.nome,
      changes: diffFields(serializeSeguro(existing), serializeSeguro(updated), SEGURO_FIELD_LABELS),
    });

    return NextResponse.json({ seguro: serializeSeguro(updated) });
  },
);

export const DELETE = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await requireAuthWithActing(request);
    const { targetUserId } = auth;
    const { id } = await params;

    const existing = await findOwned(id, targetUserId);
    if (!existing) {
      return NextResponse.json({ error: 'Seguro não encontrado' }, { status: 404 });
    }

    await prisma.seguroApolice.delete({ where: { id } });

    const dto = serializeSeguro(existing);
    await recordChange({
      request,
      auth,
      section: 'saude-financeira',
      action: 'seguro.excluir',
      entity: 'seguro',
      entityId: id,
      entityLabel: existing.nome,
      changes: finalStateChanges(dto, SEGURO_FIELD_LABELS),
      // Snapshot p/ o Desfazer recriar a apólice (kind 'seguro' no registry).
      snapshot: {
        v: 1,
        kind: 'seguro',
        data: {
          id: dto.id,
          nome: dto.nome,
          tipo: dto.tipo,
          cobertura: dto.cobertura,
          risco: dto.risco,
          custoAnual: dto.custoAnual,
          capitalSegurado: dto.capitalSegurado,
          notes: dto.notes,
        },
      },
    });

    return NextResponse.json({ success: true });
  },
);
