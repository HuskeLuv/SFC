import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth';
import prisma from '@/lib/prisma';
import { getUserCashflowStructure } from '@/utils/cashflowSetup';

import { withErrorHandler } from '@/utils/apiErrorHandler';
// Buscar estrutura do cashflow do usuário
export const GET = withErrorHandler(async (req: NextRequest) => {
  // Verificar autenticação
  const payload = requireAuth(req);

  const user = await prisma.user.findUnique({
    where: { email: payload.email },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  // Buscar estrutura
  const structure = await getUserCashflowStructure(user.id);

  return NextResponse.json(structure);
});
