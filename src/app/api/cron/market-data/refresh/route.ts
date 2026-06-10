import { NextRequest, NextResponse } from 'next/server';
import { runRefreshCycle } from '@/services/pricing/marketDataBackfill';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Cron: mantém `asset_dividend_history` + `asset_corporate_actions` frescos pra
 * TODO o catálogo RV, em lotes dentro do orçamento de 60s do Vercel.
 *
 * É o que tira o runtime da dependência de fonte externa: o caminho de request lê
 * só do banco (banco-only), e este job é quem busca/atualiza em background. Cada
 * ciclo (1) drena a fila de gaps (símbolos novos/falhos — GAP_QUEUED/FETCH_FAIL) e
 * (2) refresca os já cobertos mais antigos. Em N execuções percorre o catálogo
 * inteiro. Idempotente (upserts) e não-destrutivo (sem delete+refetch).
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

  const result = await runRefreshCycle();
  return NextResponse.json(result);
});
