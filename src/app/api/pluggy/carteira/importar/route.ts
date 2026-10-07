import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { logger } from '@/lib/logger';
import { importarPendentes } from '@/services/pluggy/importarCarteira';
import { pluggyDestinosHabilitado } from '@/lib/pluggyDestinos';
import { classificarDestinos, contarParaRevisar } from '@/services/pluggy/destinosImportacao';
import { requireProprioUsuarioPluggy } from '../../_lib/auth';

/**
 * POST /api/pluggy/carteira/importar — importa o que estiver pendente (normalmente já foi no sync).
 *
 * Depois da importação, classificarDestinos marca como conferidos os itens sem
 * escolha (roda mesmo com a chave PLUGGY_DESTINOS_HABILITADO desligada: só
 * grava a coluna) e a resposta ganha `paraRevisar` (0 com a chave desligada).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await requireProprioUsuarioPluggy(request);
  const r = await importarPendentes(user.id);

  let paraRevisar = 0;
  try {
    // Best-effort, como no sync: a importação já foi gravada.
    await classificarDestinos(user.id);
    if (pluggyDestinosHabilitado()) paraRevisar = await contarParaRevisar(user.id);
  } catch (error: unknown) {
    logger.error('[pluggy] classificar destinos após importar falhou', {
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return NextResponse.json({ ...r, paraRevisar });
});
