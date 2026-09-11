import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { getBuildId } from '@/lib/buildId';

/**
 * Build atual do app (ticket 20/08/2026: cliente com aba aberta ficava na
 * versão antiga após deploy). O `VersionWatcher` do layout compara este id com
 * o que veio no bundle carregado e força reload quando diverge.
 *
 * Fonte: .next/BUILD_ID via getBuildId() (em dev não existe → 'dev', watcher
 * nunca acusa stale).
 */

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async () => {
  return NextResponse.json(
    { buildId: await getBuildId() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
