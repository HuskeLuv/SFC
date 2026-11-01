import { NextRequest, NextResponse } from 'next/server';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { requireSession } from '@/utils/auth';
import { valoresOcultosHabilitado } from '@/lib/valoresOcultosConfig';
import { COOKIE_VALORES_OCULTOS, opcoesCookieValoresOcultos } from '@/utils/valoresOcultos';

/**
 * POST /api/preferencias/valores-ocultos — grava a preferência do olho ("esconder valores") num
 * cookie POR APARELHO, pelo SERVIDOR: o Safari/WebKit (ITP) corta para 7 dias todo cookie criado
 * por script, e o PWA do iPhone voltaria sozinho a mostrar os valores. Com Set-Cookie de 1 ano
 * (renovado pelo middleware a cada navegação) a preferência fica. Sem banco, sem migration.
 *
 * Body `{ ocultos: boolean }`. CSRF validado pelo middleware (o cliente usa csrfFetch).
 * 404 com a flag VALORES_OCULTOS_HABILITADO desligada.
 */
export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!valoresOcultosHabilitado()) {
    throw new ApiError(404, 'Recurso indisponível');
  }
  await requireSession(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, 'Corpo inválido');
  }
  const ocultos = (body as { ocultos?: unknown } | null)?.ocultos;
  if (typeof ocultos !== 'boolean') {
    throw new ApiError(400, 'Informe ocultos (true ou false)');
  }

  const response = NextResponse.json({ ocultos }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(
    COOKIE_VALORES_OCULTOS,
    ocultos ? '1' : '',
    opcoesCookieValoresOcultos(ocultos, process.env.NODE_ENV === 'production'),
  );
  return response;
});
