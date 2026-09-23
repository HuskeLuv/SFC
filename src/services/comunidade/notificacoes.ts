/**
 * Notificações da Comunidade no sino do app (tabela Notification).
 * Best-effort: falha aqui nunca derruba a ação que a disparou.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const COMUNIDADE_COMENTARIO_TYPE = 'comunidade-comentario';
export const COMUNIDADE_MODERACAO_TYPE = 'comunidade-moderacao';

export const hrefPost = (postId: string) => `/comunidade/${postId}`;

/**
 * Avisa o autor do post que chegou comentário. Enquanto houver um aviso NÃO
 * lido do mesmo post, não empilha outro (evita inundar o sino).
 */
export async function notificarComentario(params: {
  postId: string;
  postAuthorId: string;
  comentaristaId: string;
  comentaristaNome: string;
}): Promise<void> {
  const { postId, postAuthorId, comentaristaId, comentaristaNome } = params;
  if (postAuthorId === comentaristaId) return;
  try {
    const pendente = await prisma.notification.findFirst({
      where: {
        userId: postAuthorId,
        type: COMUNIDADE_COMENTARIO_TYPE,
        readAt: null,
        metadata: { path: ['postId'], equals: postId },
      },
      select: { id: true },
    });
    if (pendente) return;
    await prisma.notification.create({
      data: {
        userId: postAuthorId,
        type: COMUNIDADE_COMENTARIO_TYPE,
        title: 'Novo comentário no seu post',
        message: `${comentaristaNome} comentou na sua publicação da comunidade.`,
        metadata: { postId, href: hrefPost(postId) },
      },
    });
  } catch (error: unknown) {
    logger.error('[comunidade] falha ao notificar comentário:', error);
  }
}

/** Avisa o autor que a equipe ocultou um conteúdo dele. */
export async function notificarOcultacao(params: {
  authorId: string;
  tipo: 'post' | 'comentario';
  motivo: string | null;
}): Promise<void> {
  const { authorId, tipo, motivo } = params;
  try {
    await prisma.notification.create({
      data: {
        userId: authorId,
        type: COMUNIDADE_MODERACAO_TYPE,
        title: tipo === 'post' ? 'Publicação removida' : 'Comentário removido',
        message: `A equipe My Finance removeu ${
          tipo === 'post' ? 'uma publicação sua' : 'um comentário seu'
        } da comunidade${motivo ? `: ${motivo}` : '.'}`,
        metadata: { tipo },
      },
    });
  } catch (error: unknown) {
    logger.error('[comunidade] falha ao notificar ocultação:', error);
  }
}
