/**
 * GET /api/educacao/cursos → lista de cursos publicados com progresso do
 * usuário, flag de bloqueio por nível de acesso (paywall futuro), a trilha
 * de módulos (cards com capa/duração/progresso) e a aula de "Continue de
 * onde parou" (layout de referência do Pedro, ticket 25/08/2026).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { canAccess, effectiveRequiredLevel } from '@/utils/accessLevel';
import {
  calcularContinuar,
  pct,
  resumirModulo,
  type TrilhaModuloInput,
} from '@/utils/educacaoTrilha';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const [user, courses, progressos] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetUserId }, select: { accessLevel: true } }),
    prisma.course.findMany({
      where: { published: true },
      orderBy: { orderIndex: 'asc' },
      include: {
        modules: {
          orderBy: { orderIndex: 'asc' },
          include: {
            lessons: {
              orderBy: { orderIndex: 'asc' },
              select: { id: true, title: true, durationSeconds: true, requiredLevel: true },
            },
          },
        },
      },
    }),
    prisma.lessonProgress.findMany({
      where: { userId: targetUserId },
      select: { lessonId: true, completedAt: true, updatedAt: true },
    }),
  ]);

  const progressoPorAula = new Map(progressos.map((p) => [p.lessonId, p]));
  const accessLevel = user?.accessLevel ?? 0;

  const cursos = courses.map((course) => {
    const bloqueado = !canAccess(accessLevel, course.requiredLevel);
    const trilhaInput: TrilhaModuloInput[] = course.modules.map((mod) => ({
      id: mod.id,
      title: mod.title,
      description: mod.description ?? null,
      coverUrl: mod.coverUrl ?? null,
      aulas: mod.lessons.map((lesson) => {
        const requiredLevel = effectiveRequiredLevel(
          course.requiredLevel,
          lesson.requiredLevel ?? 0,
        );
        const prog = progressoPorAula.get(lesson.id);
        return {
          id: lesson.id,
          title: lesson.title,
          durationSeconds: lesson.durationSeconds ?? null,
          requiredLevel,
          bloqueada: !canAccess(accessLevel, requiredLevel),
          concluida: prog?.completedAt != null,
          ultimaInteracao: prog?.updatedAt ?? null,
        };
      }),
    }));

    const modulos = trilhaInput.map(resumirModulo);
    const totalAulas = modulos.reduce((s, m) => s + m.totalAulas, 0);
    const aulasConcluidas = modulos.reduce((s, m) => s + m.aulasConcluidas, 0);
    const duracaoSegundos = modulos.reduce((s, m) => s + m.duracaoSegundos, 0);

    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      coverUrl: course.coverUrl,
      requiredLevel: course.requiredLevel,
      bloqueado,
      totalAulas,
      aulasConcluidas,
      progresso: pct(aulasConcluidas, totalAulas),
      duracaoSegundos,
      modulos,
      modulosConcluidos: modulos.filter((m) => m.status === 'concluido').length,
      continuar: bloqueado ? null : calcularContinuar(trilhaInput),
    };
  });

  return NextResponse.json({ cursos, accessLevel });
});
