import { NextRequest, NextResponse } from 'next/server';

import { runTesouroDiretoSync } from '@/services/pricing/tesouroDiretoSync';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Cron HTTP: GET com Authorization: Bearer CRON_SECRET
 *
 * Baixa preços diários de títulos do Tesouro Direto do portal
 * Tesouro Transparente (CSV ~13MB) e persiste na tabela TesouroDiretoPrice.
 * Também atualiza Asset.currentPrice para ativos vinculados.
 *
 * Agendado em vercel.json (06:15 UTC).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 503 });
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const result = await runTesouroDiretoSync();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[cron/tesouro-direto-sync]', error);
    return NextResponse.json(
      { error: 'Falha ao sincronizar dados do Tesouro Direto' },
      { status: 500 },
    );
  }
});
