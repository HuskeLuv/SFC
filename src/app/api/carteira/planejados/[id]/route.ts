import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { validationError, zPercentage } from '@/utils/validation-schemas';

/**
 * PATCH  /api/carteira/planejados/[id] — altera o objetivo do ativo planejado.
 * DELETE /api/carteira/planejados/[id] — desiste do planejamento (remove a linha).
 * Ver `services/portfolio/ativosPlanejados.ts`.
 */
type Ctx = { params: Promise<{ id: string }> };

const planejadoPatchSchema = z.object({
  objetivo: zPercentage.optional(),
  observacoes: z.string().max(500).optional().nullable(),
});

async function localizar(request: NextRequest, ctx: Ctx) {
  const { targetUserId } = await requireAuthWithActing(request);
  const { id } = await ctx.params;
  const planejado = await prisma.watchlist.findFirst({ where: { id, userId: targetUserId } });
  if (!planejado) throw new ApiError(404, 'Ativo planejado não encontrado');
  return planejado;
}

export const PATCH = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const planejado = await localizar(request, ctx);
  const parsed = planejadoPatchSchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);
  const { objetivo, observacoes } = parsed.data;

  const atualizado = await prisma.watchlist.update({
    where: { id: planejado.id },
    data: {
      ...(objetivo !== undefined ? { objetivo } : {}),
      ...(observacoes !== undefined ? { notes: observacoes?.trim() || null } : {}),
    },
  });
  return NextResponse.json({ success: true, planejado: atualizado });
});

export const DELETE = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const planejado = await localizar(request, ctx);
  await prisma.watchlist.delete({ where: { id: planejado.id } });
  return NextResponse.json({ success: true });
});
