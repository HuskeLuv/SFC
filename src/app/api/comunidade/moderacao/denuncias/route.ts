/**
 * GET /api/comunidade/moderacao/denuncias → fila de denúncias abertas
 * (equipe My Finance e admins).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirModerador } from '@/services/comunidade/membro';
import { listarDenunciasAbertas } from '@/services/comunidade/moderacao';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const moderador = await exigirModerador(request);
  const denuncias = await listarDenunciasAbertas(moderador.id);
  return NextResponse.json({ denuncias }, { headers: { 'Cache-Control': 'no-store' } });
});
