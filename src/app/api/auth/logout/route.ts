import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { clearSessionCookie } from '@/lib/auth/session';

export const POST = withErrorHandler(async (_req: NextRequest) => {
  const response = NextResponse.json({ message: 'Sessão encerrada com sucesso' });

  clearSessionCookie(response);
  // Limpa o cache HTTP do navegador (respostas com dados do usuário). NÃO usar
  // "storage": apagaria o tema, as dispensas e o service worker.
  response.headers.set('Clear-Site-Data', '"cache"');

  return response;
});
