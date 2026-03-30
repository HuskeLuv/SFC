import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '@/utils/auth';
import { resolveActingContext } from '@/utils/consultantActing';
import { withErrorHandler } from '@/utils/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = req.cookies.get('token')?.value;
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    const actingContext = await resolveActingContext(req, {
      id: user.id,
      role: user.role,
    });
    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      actingClient: actingContext.actingClient,
    });
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
});
