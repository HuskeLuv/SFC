import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { objetivoSchema, validationError } from '@/utils/validation-schemas';

export async function POST(request: NextRequest) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);
    const body = await request.json();
    const parsed = objetivoSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { ativoId, objetivo } = parsed.data;

    const updateResult = await prisma.portfolio.updateMany({
      where: { id: ativoId, userId: targetUserId },
      data: { objetivo },
    });

    if (updateResult.count === 0) {
      return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Objetivo atualizado com sucesso',
    });
  } catch (error) {
    console.error('Erro ao atualizar objetivo:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
