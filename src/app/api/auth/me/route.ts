import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  // Centralizado em requireAuthWithActing (auditoria 29/08/2026, 1.3/2.2):
  // o helper já valida o JWT e resolve o contexto de impersonation.
  const { payload, actingClient } = await requireAuthWithActing(req);
  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    actingClient,
  });
});
