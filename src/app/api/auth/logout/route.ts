import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { clearSessionCookie } from '@/lib/auth/session';

/**
 * Sai DESTE aparelho: apaga o cookie. O JWT em si NÃO é revogado no servidor — uma cópia do
 * token (malware, backup do navegador) segue válida até o `exp`, renovando pelo /api/auth/me
 * até o teto de 90 dias (src/lib/auth/session.ts). A revogação de verdade é "Sair de todos os
 * dispositivos" no Perfil (DELETE /api/profile/sessoes, bump do sessionVersion). Não dar bump
 * aqui: derrubaria os outros aparelhos. Revogar só este token exige um id de sessão (jti) com
 * lista de revogados no banco — fica para um PR próprio.
 */
export const POST = withErrorHandler(async (_req: NextRequest) => {
  const response = NextResponse.json({ message: 'Sessão encerrada com sucesso' });

  clearSessionCookie(response);
  // Limpa o cache HTTP do navegador (respostas com dados do usuário). NÃO usar
  // "storage": apagaria o tema, as dispensas e o service worker.
  response.headers.set('Clear-Site-Data', '"cache"');

  return response;
});
