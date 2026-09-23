/**
 * GET    /api/comunidade/posts/:id → post + comentários
 * PATCH  /api/comunidade/posts/:id { conteudo?, categoria? } → edição pelo autor
 * DELETE /api/comunidade/posts/:id → exclusão pelo autor (soft delete)
 *
 * Remoção pela equipe é outra coisa (ocultar, com motivo) — ver /moderacao/acao.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { CHAVES_CATEGORIAS, COMUNIDADE_LIMITES } from '@/constants/comunidade';
import { exigirMembro, exigirMembroAtivo } from '@/services/comunidade/membro';
import { normalizarTexto, podePublicarNaCategoria } from '@/services/comunidade/permissoes';
import { detalharPost, postInclude, serializarPost } from '@/services/comunidade/posts';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const idSchema = z.string().uuid();

async function lerId(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) throw new ApiError(404, 'Publicação não encontrada');
  return id;
}

export const GET = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const membro = await exigirMembro(request);
  const id = await lerId(ctx);
  const detalhe = await detalharPost(id, membro.id, membro.moderador);
  if (!detalhe) throw new ApiError(404, 'Publicação não encontrada');
  return NextResponse.json(detalhe, { headers: { 'Cache-Control': 'no-store' } });
});

const editarSchema = z
  .object({
    conteudo: z.string().max(COMUNIDADE_LIMITES.postMaxChars).optional(),
    categoria: z.enum(CHAVES_CATEGORIAS).optional(),
  })
  .refine((b) => b.conteudo !== undefined || b.categoria !== undefined, 'Nada para alterar');

/** Post do próprio autor, ainda não excluído nem oculto. */
async function postDoAutor(id: string, authorId: string) {
  const post = await prisma.communityPost.findFirst({
    where: { id, authorId, excluidoEm: null, ocultoEm: null },
    select: { id: true },
  });
  if (!post) throw new ApiError(404, 'Publicação não encontrada');
  return post;
}

export const PATCH = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const membro = await exigirMembroAtivo(request);
  const id = await lerId(ctx);

  const parsed = editarSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new ApiError(400, 'Dados inválidos', parsed.error.flatten().fieldErrors);
  }
  await postDoAutor(id, membro.id);

  const data: { conteudo?: string; categoria?: string } = {};
  if (parsed.data.conteudo !== undefined) {
    const conteudo = normalizarTexto(parsed.data.conteudo);
    if (!conteudo) throw new ApiError(400, 'A publicação não pode ficar vazia');
    data.conteudo = conteudo;
  }
  if (parsed.data.categoria !== undefined) {
    const cargo = membro.perfil.cargo;
    if (!podePublicarNaCategoria({ role: membro.role, cargo }, parsed.data.categoria)) {
      throw new ApiError(403, 'Você não pode publicar nesta categoria');
    }
    data.categoria = parsed.data.categoria;
  }

  const post = await prisma.communityPost.update({
    where: { id },
    data: { ...data, editadoEm: new Date() },
    include: postInclude(membro.id),
  });
  return NextResponse.json({ post: serializarPost(post, membro.id, membro.moderador) });
});

export const DELETE = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  // Excluir o próprio post vale mesmo suspenso (o membro pode querer limpar).
  const membro = await exigirMembro(request);
  const id = await lerId(ctx);
  await postDoAutor(id, membro.id);
  await prisma.communityPost.update({
    where: { id },
    data: { excluidoEm: new Date(), fixadoEm: null },
  });
  return NextResponse.json({ ok: true });
});
