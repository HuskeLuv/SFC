import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

import { runEconomicIndexesIngestion } from '@/services/market/economicIndexesIngestion';
import { resyncDividasIndexadas } from '@/services/dividas/dividaCashflowSync';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Cron HTTP: GET com Authorization: Bearer CRON_SECRET
 *
 * Ingere dados de 15 séries econômicas do BACEN SGS:
 * CDI, SELIC, IPCA, IGP-M, TR, Poupança, IMA-B e outros.
 *
 * Agendado em vercel.json (06:00 UTC, antes do sync de preços BRAPI).
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
    const result = await runEconomicIndexesIngestion();
    // Índices novos mudam a correção das parcelas de dívidas indexadas —
    // ressincroniza as linhas-espelho do fluxo de caixa (best-effort: falha
    // aqui não invalida a ingestão).
    let dividasResync: { dividas: number; usuarios: number } | { error: string };
    try {
      dividasResync = await resyncDividasIndexadas();
    } catch (error) {
      logger.error('[cron/economic-indexes] resync dívidas indexadas falhou', error);
      dividasResync = { error: 'resync de dívidas indexadas falhou' };
    }
    return NextResponse.json({ ...result, dividasResync });
  } catch (error) {
    logger.error('[cron/economic-indexes]', error);
    return NextResponse.json(
      { error: 'Falha ao executar ingestão de índices econômicos' },
      { status: 500 },
    );
  }
});
