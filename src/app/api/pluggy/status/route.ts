import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireAdmin } from '@/utils/auth';
import { getPluggyClient } from '@/lib/pluggy';
import { pluggyHabilitado, pluggyIncluiSandbox, pluggyWebhookSecret } from '@/lib/pluggyConfig';

/**
 * GET /api/pluggy/status — checagem da integração (só admin, só leitura).
 *
 * Diz se a flag e as credenciais estão configuradas e, se estiverem, valida
 * as credenciais de verdade (POST /auth do SDK) listando conectores. Serve
 * para conferir o ambiente antes de ligar o widget/webhook.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireAdmin(request);

  const base = {
    habilitado: pluggyHabilitado(),
    incluiSandbox: pluggyIncluiSandbox(),
    webhookSecretConfigurado: pluggyWebhookSecret() !== null,
  };

  if (!base.habilitado) {
    return NextResponse.json(
      { ...base, credenciaisOk: false, motivo: 'PLUGGY_HABILITADO=true e credenciais ausentes' },
      { headers: NO_STORE },
    );
  }

  try {
    const page = await getPluggyClient().fetchConnectors({
      countries: ['BR'],
      sandbox: base.incluiSandbox,
    });
    return NextResponse.json(
      { ...base, credenciaisOk: true, conectores: page.total ?? page.results.length },
      { headers: NO_STORE },
    );
  } catch (error: unknown) {
    const motivo = error instanceof Error ? error.message : 'falha ao autenticar no Pluggy';
    return NextResponse.json({ ...base, credenciaisOk: false, motivo }, { headers: NO_STORE });
  }
});
