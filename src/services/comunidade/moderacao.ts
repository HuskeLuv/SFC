/**
 * Moderação posterior da Comunidade (equipe My Finance + admins).
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { ApiError } from '@/utils/apiErrorHandler';
import { MOTIVOS_DENUNCIA, type MotivoDenuncia } from '@/constants/comunidade';
import type { DenunciaComunidade } from '@/types/comunidade';
import { comentarioInclude, postInclude, serializarComentario, serializarPost } from './posts';
import { notificarOcultacao } from './notificacoes';

/** Fila de denúncias abertas, uma entrada por conteúdo (a mais antiga primeiro). */
export async function listarDenunciasAbertas(moderadorId: string): Promise<DenunciaComunidade[]> {
  const abertas = await prisma.communityReport.findMany({
    where: { status: 'aberta' },
    orderBy: { createdAt: 'asc' },
    take: 200,
    include: {
      reporter: { select: { id: true, name: true } },
      post: { include: postInclude(moderadorId) },
      comment: { include: comentarioInclude },
    },
  });

  const porAlvo = new Map<string, DenunciaComunidade>();
  for (const r of abertas) {
    const chave = r.postId ? `p:${r.postId}` : `c:${r.commentId}`;
    const existente = porAlvo.get(chave);
    if (existente) {
      existente.totalNoAlvo += 1;
      continue;
    }
    const alvo: DenunciaComunidade['alvo'] | null = r.post
      ? { tipo: 'post', post: serializarPost(r.post, moderadorId, true) }
      : r.comment
        ? { tipo: 'comentario', comentario: serializarComentario(r.comment, moderadorId, true) }
        : null;
    if (!alvo) continue;
    porAlvo.set(chave, {
      id: r.id,
      motivo: MOTIVOS_DENUNCIA[r.motivo as MotivoDenuncia] ?? r.motivo,
      detalhe: r.detalhe,
      createdAt: r.createdAt.toISOString(),
      denunciante: { id: r.reporter.id, nome: r.reporter.name },
      alvo,
      totalNoAlvo: 1,
    });
  }
  return [...porAlvo.values()];
}

export type AcaoModeracao =
  | { tipo: 'ocultar'; postId?: string; commentId?: string; motivo?: string }
  | { tipo: 'restaurar'; postId?: string; commentId?: string }
  | { tipo: 'fixar' | 'desafixar'; postId: string }
  | { tipo: 'descartar-denuncia'; denunciaId: string }
  | { tipo: 'suspender'; userId: string; dias: number; motivo?: string }
  | { tipo: 'reativar'; userId: string };

const resolverDenuncias = (
  alvo: { postId?: string; commentId?: string },
  status: 'resolvida' | 'descartada',
  moderadorId: string,
) =>
  prisma.communityReport.updateMany({
    where: {
      status: 'aberta',
      ...(alvo.postId ? { postId: alvo.postId } : { commentId: alvo.commentId }),
    },
    data: { status, resolvidoPorId: moderadorId, resolvidoEm: new Date() },
  });

const exigirAlvo = (a: { postId?: string; commentId?: string }) => {
  if ((a.postId ? 1 : 0) + (a.commentId ? 1 : 0) !== 1) {
    throw new ApiError(400, 'Informe o post OU o comentário');
  }
};

export async function executarAcao(moderadorId: string, acao: AcaoModeracao): Promise<void> {
  const agora = new Date();
  switch (acao.tipo) {
    case 'ocultar': {
      exigirAlvo(acao);
      const motivo = acao.motivo?.trim() || null;
      const dados = { ocultoEm: agora, ocultoPorId: moderadorId, ocultoMotivo: motivo };
      const alvo = acao.postId
        ? await prisma.communityPost.findFirst({
            where: { id: acao.postId, excluidoEm: null },
            select: { authorId: true, ocultoEm: true },
          })
        : await prisma.communityComment.findFirst({
            where: { id: acao.commentId, excluidoEm: null },
            select: { authorId: true, ocultoEm: true },
          });
      if (!alvo) throw new ApiError(404, 'Conteúdo não encontrado');
      if (acao.postId) {
        await prisma.communityPost.update({
          where: { id: acao.postId },
          data: { ...dados, fixadoEm: null },
        });
      } else {
        await prisma.communityComment.update({ where: { id: acao.commentId }, data: dados });
      }
      await resolverDenuncias(acao, 'resolvida', moderadorId);
      if (!alvo.ocultoEm) {
        await notificarOcultacao({
          authorId: alvo.authorId,
          tipo: acao.postId ? 'post' : 'comentario',
          motivo,
        });
      }
      break;
    }
    case 'restaurar': {
      exigirAlvo(acao);
      const dados = { ocultoEm: null, ocultoPorId: null, ocultoMotivo: null };
      const { count } = acao.postId
        ? await prisma.communityPost.updateMany({
            where: { id: acao.postId, excluidoEm: null },
            data: dados,
          })
        : await prisma.communityComment.updateMany({
            where: { id: acao.commentId, excluidoEm: null },
            data: dados,
          });
      if (!count) throw new ApiError(404, 'Conteúdo não encontrado');
      break;
    }
    case 'fixar':
    case 'desafixar': {
      const { count } = await prisma.communityPost.updateMany({
        where: { id: acao.postId, excluidoEm: null, ocultoEm: null },
        data: { fixadoEm: acao.tipo === 'fixar' ? agora : null },
      });
      if (!count) throw new ApiError(404, 'Publicação não encontrada');
      break;
    }
    case 'descartar-denuncia': {
      const denuncia = await prisma.communityReport.findUnique({
        where: { id: acao.denunciaId },
        select: { postId: true, commentId: true },
      });
      if (!denuncia) throw new ApiError(404, 'Denúncia não encontrada');
      await resolverDenuncias(
        denuncia.postId ? { postId: denuncia.postId } : { commentId: denuncia.commentId! },
        'descartada',
        moderadorId,
      );
      break;
    }
    case 'suspender': {
      if (acao.userId === moderadorId) throw new ApiError(400, 'Você não pode se suspender');
      const alvo = await prisma.user.findUnique({
        where: { id: acao.userId },
        select: { role: true, communityProfile: { select: { cargo: true } } },
      });
      if (!alvo?.communityProfile) throw new ApiError(404, 'Membro não encontrado');
      if (alvo.role === 'admin' || alvo.communityProfile.cargo === 'equipe') {
        throw new ApiError(403, 'Não é possível suspender alguém da equipe');
      }
      await prisma.communityProfile.update({
        where: { userId: acao.userId },
        data: {
          suspensoAte: new Date(agora.getTime() + acao.dias * 24 * 60 * 60 * 1000),
          suspensoMotivo: acao.motivo?.trim() || null,
        },
      });
      break;
    }
    case 'reativar': {
      const { count } = await prisma.communityProfile.updateMany({
        where: { userId: acao.userId },
        data: { suspensoAte: null, suspensoMotivo: null },
      });
      if (!count) throw new ApiError(404, 'Membro não encontrado');
      break;
    }
  }
  logger.info('[comunidade] moderação', { moderadorId, acao: acao.tipo });
}
