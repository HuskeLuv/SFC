/**
 * POST /api/comunidade/moderacao/acao → ação da equipe sobre conteúdo ou membro:
 * ocultar/restaurar, fixar/desafixar, descartar denúncia, suspender/reativar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { COMUNIDADE_LIMITES } from '@/constants/comunidade';
import { exigirModerador } from '@/services/comunidade/membro';
import { executarAcao } from '@/services/comunidade/moderacao';

const uuid = z.string().uuid();
const motivo = z.string().max(300).optional();

const acaoSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('ocultar'),
    postId: uuid.optional(),
    commentId: uuid.optional(),
    motivo,
  }),
  z.object({ tipo: z.literal('restaurar'), postId: uuid.optional(), commentId: uuid.optional() }),
  z.object({ tipo: z.literal('fixar'), postId: uuid }),
  z.object({ tipo: z.literal('desafixar'), postId: uuid }),
  z.object({ tipo: z.literal('descartar-denuncia'), denunciaId: uuid }),
  z.object({
    tipo: z.literal('suspender'),
    userId: uuid,
    dias: z.number().int().min(1).max(COMUNIDADE_LIMITES.suspensaoMaxDias),
    motivo,
  }),
  z.object({ tipo: z.literal('reativar'), userId: uuid }),
]);

export const POST = withErrorHandler(async (request: NextRequest) => {
  const moderador = await exigirModerador(request);
  const parsed = acaoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, 'Dados inválidos');
  await executarAcao(moderador.id, parsed.data);
  return NextResponse.json({ ok: true });
});
