/**
 * POST /api/comunidade/denuncias { postId | commentId, motivo, detalhe? } →
 * entra na fila da equipe. Uma denúncia aberta por pessoa por conteúdo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { COMUNIDADE_LIMITES, MOTIVOS_DENUNCIA, type MotivoDenuncia } from '@/constants/comunidade';
import { exigirMembro } from '@/services/comunidade/membro';
import { normalizarTexto } from '@/services/comunidade/permissoes';

const denunciaSchema = z
  .object({
    postId: z.string().uuid().optional(),
    commentId: z.string().uuid().optional(),
    motivo: z.enum(Object.keys(MOTIVOS_DENUNCIA) as [MotivoDenuncia, ...MotivoDenuncia[]]),
    detalhe: z.string().max(COMUNIDADE_LIMITES.detalheDenunciaMaxChars).optional(),
  })
  .refine(
    (b) => (b.postId ? 1 : 0) + (b.commentId ? 1 : 0) === 1,
    'Informe o post OU o comentário',
  );

export const POST = withErrorHandler(async (request: NextRequest) => {
  // Suspenso ainda pode denunciar — denúncia não publica nada.
  const membro = await exigirMembro(request);
  const parsed = denunciaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, 'Dados inválidos');
  const { postId, commentId, motivo } = parsed.data;

  const alvoExiste = postId
    ? await prisma.communityPost.count({ where: { id: postId, excluidoEm: null, ocultoEm: null } })
    : await prisma.communityComment.count({
        where: { id: commentId, excluidoEm: null, ocultoEm: null },
      });
  if (!alvoExiste) throw new ApiError(404, 'Conteúdo não encontrado');

  const umDiaAtras = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [jaDenunciou, noDia] = await Promise.all([
    prisma.communityReport.count({
      where: {
        reporterId: membro.id,
        status: 'aberta',
        postId: postId ?? null,
        commentId: commentId ?? null,
      },
    }),
    prisma.communityReport.count({
      where: { reporterId: membro.id, createdAt: { gte: umDiaAtras } },
    }),
  ]);
  // Repetida: responde OK sem duplicar (a pessoa só quer saber que foi recebida).
  if (jaDenunciou) return NextResponse.json({ ok: true });
  if (noDia >= COMUNIDADE_LIMITES.denunciasPorDia) {
    throw new ApiError(429, 'Limite diário de denúncias atingido. Tente amanhã.');
  }

  await prisma.communityReport.create({
    data: {
      reporterId: membro.id,
      postId: postId ?? null,
      commentId: commentId ?? null,
      motivo,
      detalhe: parsed.data.detalhe ? normalizarTexto(parsed.data.detalhe) || null : null,
    },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
});
