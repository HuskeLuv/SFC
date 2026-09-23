/**
 * POST /api/comunidade/posts/:id/curtir { curtir: boolean } → liga/desliga a
 * curtida (idempotente) e devolve o total atualizado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { exigirMembroAtivo } from '@/services/comunidade/membro';
import { whereVisivel } from '@/services/comunidade/posts';

type Ctx = { params: Promise<{ id: string }> };

const curtirSchema = z.object({ curtir: z.boolean() });

export const POST = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const membro = await exigirMembroAtivo(request);
  const { id } = await ctx.params;
  const parsed = curtirSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.string().uuid().safeParse(id).success) {
    throw new ApiError(400, 'Dados inválidos');
  }

  const post = await prisma.communityPost.findFirst({
    where: { id, ...whereVisivel(false) },
    select: { id: true },
  });
  if (!post) throw new ApiError(404, 'Publicação não encontrada');

  const chave = { postId_userId: { postId: id, userId: membro.id } };
  if (parsed.data.curtir) {
    await prisma.communityLike.upsert({
      where: chave,
      create: { postId: id, userId: membro.id },
      update: {},
    });
  } else {
    await prisma.communityLike.deleteMany({ where: { postId: id, userId: membro.id } });
  }
  const curtidas = await prisma.communityLike.count({ where: { postId: id } });
  return NextResponse.json({ curtiu: parsed.data.curtir, curtidas });
});
