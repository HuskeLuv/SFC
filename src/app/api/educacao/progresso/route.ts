/**
 * POST /api/educacao/progresso → marca/desmarca uma aula como concluída.
 * Body: { lessonId: string, concluida: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { canAccess, effectiveRequiredLevel } from '@/utils/accessLevel';

const progressoSchema = z.object({
  lessonId: z.string().uuid(),
  concluida: z.boolean(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const parsed = progressoSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { lessonId, concluida } = parsed.data;

  const [user, lesson] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetUserId }, select: { accessLevel: true } }),
    prisma.courseLesson.findUnique({
      where: { id: lessonId },
      include: {
        module: { include: { course: { select: { requiredLevel: true, published: true } } } },
      },
    }),
  ]);

  if (!lesson || !lesson.module.course.published) {
    return NextResponse.json({ error: 'Aula não encontrada' }, { status: 404 });
  }

  const requiredLevel = effectiveRequiredLevel(
    lesson.module.course.requiredLevel,
    lesson.requiredLevel,
  );
  if (!canAccess(user?.accessLevel ?? 0, requiredLevel)) {
    return NextResponse.json({ error: 'Aula indisponível no seu plano' }, { status: 403 });
  }

  const completedAt = concluida ? new Date() : null;
  const progresso = await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId: targetUserId, lessonId } },
    update: { completedAt },
    create: { userId: targetUserId, lessonId, completedAt },
  });

  return NextResponse.json({
    progresso: { lessonId: progresso.lessonId, concluida: progresso.completedAt != null },
  });
});
