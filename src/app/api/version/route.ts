import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Build atual do app (ticket 20/08/2026: cliente com aba aberta ficava na
 * versão antiga após deploy). O `VersionWatcher` do layout compara este id com
 * o que veio no bundle carregado e força reload quando diverge.
 *
 * Fonte: .next/BUILD_ID (gerado pelo `next build`; muda a cada deploy do
 * pipeline). Em dev não existe → 'dev' (watcher nunca acusa stale).
 */

let cachedBuildId: string | null = null;

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async () => {
  if (!cachedBuildId) {
    try {
      cachedBuildId = (
        await fs.readFile(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8')
      ).trim();
    } catch {
      cachedBuildId = 'dev';
    }
  }
  return NextResponse.json(
    { buildId: cachedBuildId },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
