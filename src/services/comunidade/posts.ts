/**
 * Consultas e serialização do feed da Comunidade.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { COMUNIDADE_LIMITES } from '@/constants/comunidade';
import type {
  AutorComunidade,
  ComentarioComunidade,
  FeedComunidadeResponse,
  PostComunidade,
  PostDetalheResponse,
} from '@/types/comunidade';
import { selosDoAutor } from './permissoes';

const autorSelect = {
  id: true,
  name: true,
  avatarUrl: true,
  role: true,
  communityProfile: { select: { cargo: true } },
} satisfies Prisma.UserSelect;

type AutorRow = Prisma.UserGetPayload<{ select: typeof autorSelect }>;

const COMENTARIOS_VISIVEIS = { excluidoEm: null, ocultoEm: null } as const;

export const postInclude = (viewerId: string) =>
  ({
    author: { select: autorSelect },
    likes: { where: { userId: viewerId }, select: { userId: true } },
    _count: { select: { likes: true, comments: { where: COMENTARIOS_VISIVEIS } } },
  }) satisfies Prisma.CommunityPostInclude;

type PostRow = Prisma.CommunityPostGetPayload<{ include: ReturnType<typeof postInclude> }>;

export const serializarAutor = (a: AutorRow): AutorComunidade => ({
  id: a.id,
  nome: a.name,
  avatarUrl: a.avatarUrl,
  selos: selosDoAutor(a.role, a.communityProfile?.cargo),
});

export const serializarPost = (
  p: PostRow,
  viewerId: string,
  moderador: boolean,
): PostComunidade => ({
  id: p.id,
  categoria: p.categoria,
  conteudo: p.conteudo,
  createdAt: p.createdAt.toISOString(),
  editadoEm: p.editadoEm?.toISOString() ?? null,
  fixado: p.fixadoEm != null,
  oculto: p.ocultoEm != null,
  ocultoMotivo: moderador ? p.ocultoMotivo : null,
  autor: serializarAutor(p.author),
  curtidas: p._count.likes,
  comentarios: p._count.comments,
  curtiu: p.likes.length > 0,
  meu: p.authorId === viewerId,
});

type ComentarioRow = Prisma.CommunityCommentGetPayload<{
  include: { author: { select: typeof autorSelect } };
}>;

export const serializarComentario = (
  c: ComentarioRow,
  viewerId: string,
  moderador: boolean,
): ComentarioComunidade => ({
  id: c.id,
  postId: c.postId,
  conteudo: c.conteudo,
  createdAt: c.createdAt.toISOString(),
  editadoEm: c.editadoEm?.toISOString() ?? null,
  oculto: c.ocultoEm != null,
  ocultoMotivo: moderador ? c.ocultoMotivo : null,
  autor: serializarAutor(c.author),
  meu: c.authorId === viewerId,
});

export const comentarioInclude = { author: { select: autorSelect } } as const;

/** Filtro base de visibilidade: excluído some p/ todos; oculto só moderador vê. */
export const whereVisivel = (moderador: boolean) =>
  moderador ? { excluidoEm: null } : { excluidoEm: null, ocultoEm: null };

export interface ListarFeedParams {
  viewerId: string;
  moderador: boolean;
  categoria?: string;
  autorId?: string;
  cursor?: string;
}

export async function listarFeed({
  viewerId,
  moderador,
  categoria,
  autorId,
  cursor,
}: ListarFeedParams): Promise<FeedComunidadeResponse> {
  const pageSize = COMUNIDADE_LIMITES.feedPageSize;
  const base: Prisma.CommunityPostWhereInput = {
    ...whereVisivel(moderador),
    ...(categoria ? { categoria } : {}),
    ...(autorId ? { authorId: autorId } : {}),
  };
  // Fixados só no topo da 1ª página do feed (não no perfil de um autor).
  const mostrarFixados = !cursor && !autorId;
  const include = postInclude(viewerId);

  const [fixados, pagina] = await Promise.all([
    mostrarFixados
      ? prisma.communityPost.findMany({
          where: { ...base, fixadoEm: { not: null } },
          orderBy: { fixadoEm: 'desc' },
          include,
          take: 10,
        })
      : Promise.resolve([] as PostRow[]),
    prisma.communityPost.findMany({
      where: autorId ? base : { ...base, fixadoEm: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include,
      take: pageSize + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  ]);

  const temMais = pagina.length > pageSize;
  const posts = temMais ? pagina.slice(0, pageSize) : pagina;
  return {
    fixados: fixados.map((p) => serializarPost(p, viewerId, moderador)),
    posts: posts.map((p) => serializarPost(p, viewerId, moderador)),
    nextCursor: temMais ? posts[posts.length - 1].id : null,
  };
}

export async function detalharPost(
  postId: string,
  viewerId: string,
  moderador: boolean,
): Promise<PostDetalheResponse | null> {
  const post = await prisma.communityPost.findFirst({
    where: { id: postId, ...whereVisivel(moderador) },
    include: postInclude(viewerId),
  });
  if (!post) return null;
  const comentarios = await prisma.communityComment.findMany({
    where: { postId, ...whereVisivel(moderador) },
    orderBy: { createdAt: 'asc' },
    include: comentarioInclude,
  });
  return {
    post: serializarPost(post, viewerId, moderador),
    comentarios: comentarios.map((c) => serializarComentario(c, viewerId, moderador)),
  };
}

/** Quantos itens o autor criou desde `desde` — base dos limites anti-spam. */
export async function contarRecentes(
  tipo: 'post' | 'comentario',
  authorId: string,
  desde: Date,
): Promise<number> {
  const where = { authorId, createdAt: { gte: desde } };
  return tipo === 'post'
    ? prisma.communityPost.count({ where })
    : prisma.communityComment.count({ where });
}
