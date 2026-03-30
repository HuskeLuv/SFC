import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth';
import prisma from '@/lib/prisma';
import { setupUserCashflow, hasUserCashflowSetup } from '@/utils/cashflowSetup';

import { withErrorHandler } from '@/utils/apiErrorHandler';
// Verificar se o usuário já tem estrutura configurada
export const GET = withErrorHandler(async (req: NextRequest) => {
  // Verificar autenticação
  const payload = requireAuth(req);

  const user = await prisma.user.findUnique({
    where: { email: payload.email },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  const hasSetup = await hasUserCashflowSetup(user.id);

  return NextResponse.json({
    hasSetup,
    userId: user.id,
  });
});

// Configurar estrutura inicial para o usuário
export const POST = withErrorHandler(async (req: NextRequest) => {
  // Verificar autenticação
  const payload = requireAuth(req);

  const user = await prisma.user.findUnique({
    where: { email: payload.email },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  // Configurar estrutura
  const result = await setupUserCashflow({
    userId: user.id,
  });

  return NextResponse.json({
    success: true,
    message: 'Estrutura configurada com sucesso',
    result,
  });
});
