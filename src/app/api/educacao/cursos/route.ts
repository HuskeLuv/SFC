/**
 * GET /api/educacao/cursos → lista de cursos publicados com progresso do
 * usuário e flag de bloqueio por nível de acesso (paywall futuro).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { canAccess } from '@/utils/accessLevel';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const [user, courses, concluidas] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetUserId }, select: { accessLevel: true } }),
    prisma.course.findMany({
      where: { published: true },
      orderBy: { orderIndex: 'asc' },
      include: {
        modules: {
          orderBy: { orderIndex: 'asc' },
          include: { lessons: { select: { id: true } } },
        },
      },
    }),
    prisma.lessonProgress.findMany({
      where: { userId: targetUserId, completedAt: { not: null } },
      select: { lessonId: true },
    }),
  ]);

  const concluidasSet = new Set(concluidas.map((p) => p.lessonId));
  const accessLevel = user?.accessLevel ?? 0;

  const cursos = courses.map((course) => {
    const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
    const totalAulas = lessonIds.length;
    const aulasConcluidas = lessonIds.filter((id) => concluidasSet.has(id)).length;
    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      coverUrl: course.coverUrl,
      requiredLevel: course.requiredLevel,
      bloqueado: !canAccess(accessLevel, course.requiredLevel),
      totalAulas,
      aulasConcluidas,
      progresso: totalAulas > 0 ? Math.round((aulasConcluidas / totalAulas) * 100) : 0,
    };
  });

  return NextResponse.json({ cursos, accessLevel });
});
