/**
 * GET /api/auth/totp/status — devolve só o `enabled` do user logado.
 * Endpoint leve consumido pela UI do /profile pra renderizar o estado
 * do card de 2FA sem precisar buscar o /profile inteiro.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { payload } = await requireAuthWithActing(req);
  const me = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { totpEnabled: true },
  });
  if (!me) return NextResponse.json({ enabled: false });
  return NextResponse.json({ enabled: me.totpEnabled });
});
