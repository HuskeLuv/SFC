/**
 * POST /api/comunidade/posts/:id/comentarios { conteudo } → comenta e avisa o
 * autor do post no sino.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rateLimit';
import { COMUNIDADE_LIMITES } from '@/constants/comunidade';
import { exigirMembroAtivo } from '@/services/comunidade/membro';
import { normalizarTexto } from '@/services/comunidade/permissoes';
import {
  comentarioInclude,
  contarRecentes,
  serializarComentario,
  whereVisivel,
} from '@/services/comunidade/posts';
import { notificarComentario } from '@/services/comunidade/notificacoes';

type Ctx = { params: Promise<{ id: string }> };

const comentarSchema = z.object({
  conteudo: z.string().max(COMUNIDADE_LIMITES.comentarioMaxChars),
});

export const POST = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const membro = await exigirMembroAtivo(request);
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    throw new ApiError(404, 'Publicação não encontrada');
  }
  const parsed = comentarSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new ApiError(400, 'Dados inválidos', parsed.error.flatten().fieldErrors);
  }
  const conteudo = normalizarTexto(parsed.data.conteudo);
  if (!conteudo) throw new ApiError(400, 'Escreva algo antes de comentar');

  const post = await prisma.communityPost.findFirst({
    where: { id, ...whereVisivel(false) },
    select: { id: true, authorId: true },
  });
  if (!post) throw new ApiError(404, 'Publicação não encontrada');

  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000);
  const recentes = await contarRecentes('comentario', membro.id, umaHoraAtras);
  if (recentes >= COMUNIDADE_LIMITES.comentariosPorHora) {
    throw new ApiError(429, 'Você comentou muitas vezes na última hora. Tente mais tarde.');
  }

  const comentario = await prisma.communityComment.create({
    data: { postId: id, authorId: membro.id, conteudo, ipAddress: getClientIp(request) },
    include: comentarioInclude,
  });
  await notificarComentario({
    postId: id,
    postAuthorId: post.authorId,
    comentaristaId: membro.id,
    comentaristaNome: membro.name,
  });

  return NextResponse.json(
    { comentario: serializarComentario(comentario, membro.id, membro.moderador) },
    { status: 201 },
  );
});
