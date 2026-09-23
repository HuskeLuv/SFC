/**
 * PATCH  /api/comunidade/comentarios/:id { conteudo } → edição pelo autor
 * DELETE /api/comunidade/comentarios/:id → exclusão pelo autor (soft delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { COMUNIDADE_LIMITES } from '@/constants/comunidade';
import { exigirMembro, exigirMembroAtivo } from '@/services/comunidade/membro';
import { normalizarTexto } from '@/services/comunidade/permissoes';
import { comentarioInclude, serializarComentario } from '@/services/comunidade/posts';

type Ctx = { params: Promise<{ id: string }> };

async function comentarioDoAutor(ctx: Ctx, authorId: string): Promise<string> {
  const { id } = await ctx.params;
  const achado = z.string().uuid().safeParse(id).success
    ? await prisma.communityComment.findFirst({
        where: { id, authorId, excluidoEm: null, ocultoEm: null },
        select: { id: true },
      })
    : null;
  if (!achado) throw new ApiError(404, 'Comentário não encontrado');
  return id;
}

const editarSchema = z.object({
  conteudo: z.string().max(COMUNIDADE_LIMITES.comentarioMaxChars),
});

export const PATCH = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const membro = await exigirMembroAtivo(request);
  const parsed = editarSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new ApiError(400, 'Dados inválidos', parsed.error.flatten().fieldErrors);
  }
  const conteudo = normalizarTexto(parsed.data.conteudo);
  if (!conteudo) throw new ApiError(400, 'O comentário não pode ficar vazio');
  const id = await comentarioDoAutor(ctx, membro.id);

  const comentario = await prisma.communityComment.update({
    where: { id },
    data: { conteudo, editadoEm: new Date() },
    include: comentarioInclude,
  });
  return NextResponse.json({
    comentario: serializarComentario(comentario, membro.id, membro.moderador),
  });
});

export const DELETE = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const membro = await exigirMembro(request);
  const id = await comentarioDoAutor(ctx, membro.id);
  await prisma.communityComment.update({ where: { id }, data: { excluidoEm: new Date() } });
  return NextResponse.json({ ok: true });
});
