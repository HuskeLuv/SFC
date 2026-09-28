import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { bumpSessionVersion } from '@/lib/auth/sessionVersion';
import { clearSessionCookie } from '@/lib/auth/session';
import { recordChange } from '@/services/changeHistory';

/**
 * DELETE /api/profile/sessoes — "Sair de todos os dispositivos".
 *
 * Incrementa o sessionVersion do próprio usuário (ignora impersonation):
 * todas as sessões, inclusive esta, deixam de valer — as outras em até 60s
 * (cache do sessionVersion), esta na hora (cookie limpo). Fica fora de
 * /api/auth para passar pelo CSRF do middleware.
 */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const payload = await requireSession(req);
  await bumpSessionVersion(payload.id);

  await recordChange({
    request: req,
    auth: { payload, targetUserId: payload.id, actingClient: null },
    section: 'perfil',
    action: 'sessoes.encerrar',
    entity: 'usuario',
    entityId: payload.id,
  });

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  response.headers.set('Clear-Site-Data', '"cache"');
  return response;
});
