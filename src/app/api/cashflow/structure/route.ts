import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import prisma from '@/lib/prisma';
import { getUserCashflowStructure } from '@/utils/cashflowSetup';

import { withErrorHandler } from '@/utils/apiErrorHandler';
// Buscar estrutura do cashflow do usuário
export const GET = withErrorHandler(async (req: NextRequest) => {
  // Verificar autenticação (impersonation-aware — consultor atuando lê a
  // estrutura do cliente; auditoria 29/08/2026, achados 1.3/2.2)
  const { targetUserId } = await requireAuthWithActing(req);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  // Buscar estrutura
  const structure = await getUserCashflowStructure(user.id);

  return NextResponse.json(structure);
});
