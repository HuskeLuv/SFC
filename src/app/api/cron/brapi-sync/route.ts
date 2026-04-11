import { NextRequest, NextResponse } from 'next/server';
import { syncAssets } from '@/services/pricing/brapiSync';

import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Cron HTTP (ex.: Vercel): GET com Authorization: Bearer CRON_SECRET
 *
 * Popula/atualiza a tabela Asset com ativos da B3, criptos e moedas via BRAPI,
 * e sincroniza os preços correntes. É o que mantém o catálogo do wizard (e, por
 * consequência, as abas Moedas/Criptomoedas, ETF, etc.) com dados frescos.
 *
 * Agendado em vercel.json.
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
    const result = await syncAssets();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[cron/brapi-sync]', error);
    return NextResponse.json({ error: 'Falha ao executar sincronização' }, { status: 500 });
  }
});
