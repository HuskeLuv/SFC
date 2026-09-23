/**
 * GET  /api/comunidade/posts?categoria=&autor=&cursor= → feed (fixados + página)
 * POST /api/comunidade/posts { categoria, conteudo } → publica (vai ao ar na hora;
 *      moderação é posterior, via denúncias)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rateLimit';
import { CHAVES_CATEGORIAS, COMUNIDADE_LIMITES } from '@/constants/comunidade';
import { exigirMembro, exigirMembroAtivo } from '@/services/comunidade/membro';
import { normalizarTexto, podePublicarNaCategoria } from '@/services/comunidade/permissoes';
import {
  contarRecentes,
  listarFeed,
  postInclude,
  serializarPost,
} from '@/services/comunidade/posts';

export const dynamic = 'force-dynamic';

const feedSchema = z.object({
  categoria: z.enum(CHAVES_CATEGORIAS).optional(),
  autor: z.string().uuid().optional(),
  cursor: z.string().uuid().optional(),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const membro = await exigirMembro(request);
  const sp = request.nextUrl.searchParams;
  const parsed = feedSchema.safeParse({
    categoria: sp.get('categoria') || undefined,
    autor: sp.get('autor') || undefined,
    cursor: sp.get('cursor') || undefined,
  });
  if (!parsed.success) throw new ApiError(400, 'Parâmetros inválidos');

  const feed = await listarFeed({
    viewerId: membro.id,
    moderador: membro.moderador,
    categoria: parsed.data.categoria,
    autorId: parsed.data.autor,
    cursor: parsed.data.cursor,
  });
  return NextResponse.json(feed, { headers: { 'Cache-Control': 'no-store' } });
});

const criarSchema = z.object({
  categoria: z.enum(CHAVES_CATEGORIAS),
  conteudo: z.string().max(COMUNIDADE_LIMITES.postMaxChars),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const membro = await exigirMembroAtivo(request);

  const parsed = criarSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new ApiError(400, 'Dados inválidos', parsed.error.flatten().fieldErrors);
  }
  const conteudo = normalizarTexto(parsed.data.conteudo);
  if (!conteudo) throw new ApiError(400, 'Escreva algo antes de publicar');
  const { categoria } = parsed.data;
  if (!podePublicarNaCategoria({ role: membro.role, cargo: membro.perfil.cargo }, categoria)) {
    throw new ApiError(403, 'Você não pode publicar nesta categoria');
  }

  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000);
  if ((await contarRecentes('post', membro.id, umaHoraAtras)) >= COMUNIDADE_LIMITES.postsPorHora) {
    throw new ApiError(429, 'Você publicou muitas vezes na última hora. Tente mais tarde.');
  }

  const post = await prisma.communityPost.create({
    data: { authorId: membro.id, categoria, conteudo, ipAddress: getClientIp(request) },
    include: postInclude(membro.id),
  });
  return NextResponse.json(
    { post: serializarPost(post, membro.id, membro.moderador) },
    { status: 201 },
  );
});
