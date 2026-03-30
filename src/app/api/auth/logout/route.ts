import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';

export const POST = withErrorHandler(async (_req: NextRequest) => {
  const response = NextResponse.json({ message: 'Sessão encerrada com sucesso' });

  // Limpar o cookie do token
  response.cookies.set('token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  return response;
});
