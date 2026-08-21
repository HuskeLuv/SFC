/**
 * GET /api/educacao/cursos/[slug] → árvore completa do curso (módulos + aulas)
 * com progresso do usuário. Aulas bloqueadas pelo nível de acesso NÃO levam o
 * embed VTurb no payload (o vídeo não deve vazar pra quem não tem o plano).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { canAccess, effectiveRequiredLevel } from '@/utils/accessLevel';

export const GET = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ slug: string }> }) => {
    const { targetUserId } = await requireAuthWithActing(request);
    const { slug } = await context.params;

    const [user, course] = await Promise.all([
      prisma.user.findUnique({ where: { id: targetUserId }, select: { accessLevel: true } }),
      prisma.course.findUnique({
        where: { slug },
        include: {
          modules: {
            orderBy: { orderIndex: 'asc' },
            include: { lessons: { orderBy: { orderIndex: 'asc' } } },
          },
        },
      }),
    ]);

    if (!course || !course.published) {
      return NextResponse.json({ error: 'Curso não encontrado' }, { status: 404 });
    }

    const accessLevel = user?.accessLevel ?? 0;
    const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
    const progresses = await prisma.lessonProgress.findMany({
      where: { userId: targetUserId, lessonId: { in: lessonIds } },
      select: { lessonId: true, completedAt: true },
    });
    const concluidasSet = new Set(
      progresses.filter((p) => p.completedAt != null).map((p) => p.lessonId),
    );

    const modulos = course.modules.map((mod) => ({
      id: mod.id,
      title: mod.title,
      aulas: mod.lessons.map((lesson) => {
        const requiredLevel = effectiveRequiredLevel(course.requiredLevel, lesson.requiredLevel);
        const bloqueada = !canAccess(accessLevel, requiredLevel);
        return {
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          durationSeconds: lesson.durationSeconds,
          requiredLevel,
          bloqueada,
          concluida: concluidasSet.has(lesson.id),
          vturbEmbed: bloqueada ? null : lesson.vturbEmbed,
        };
      }),
    }));

    const totalAulas = lessonIds.length;
    const aulasConcluidas = lessonIds.filter((id) => concluidasSet.has(id)).length;

    return NextResponse.json({
      curso: {
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
        modulos,
      },
      accessLevel,
    });
  },
);
