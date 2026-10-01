/**
 * Cron da Análise de Ativos — companhias abertas da CVM (fatia A).
 *
 *   ?doc=fca  dom 05:50 UTC  fca_cia_aberta_<ano>.zip  → cadastro + tickers (prazo 60 s)
 *   ?doc=dfp  diário 09:05   dfp_cia_aberta_{ano−1,ano}.zip → fundamentos anuais, ações, Raio-X, TTM
 *   ?doc=itr  diário 09:10   itr_cia_aberta_<ano>.zip (+ ano−1 até março) → trimestrais, ações, TTM
 *
 * Roda dentro do processo do app (curl -m 300): prazo interno de 240 s, streaming em disco, lock por
 * AnaliseJobRun. Arquivo inalterado (ETag/sha256) sai em segundos. Parcial = continua no próximo run.
 * Backfill histórico é script (scripts/analise-ativos/backfill-cvm-cias.ts), nunca esta rota.
 */
import type { NextRequest } from 'next/server';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';
import { executarJobAnalise, respostaCron } from '@/services/analiseAtivos/jobs/executarJob';
import { jobCvmCias, type DocCvmCias } from '@/services/analiseAtivos/jobs/nomesJobs';
import { sincronizarCvmCias } from '@/services/analiseAtivos/acoes/sincronizarCvmCias';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRAZO_MS: Record<DocCvmCias, number> = { fca: 60_000, dfp: 240_000, itr: 240_000 };

function docDaQuery(request: NextRequest): DocCvmCias {
  const doc = request.nextUrl.searchParams.get('doc');
  if (doc === 'fca' || doc === 'dfp' || doc === 'itr') return doc;
  throw new ApiError(400, 'Parâmetro doc inválido (fca | dfp | itr)');
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);
  const doc = docDaQuery(request);
  const r = await executarJobAnalise(jobCvmCias(doc), (ctx) => sincronizarCvmCias(ctx, { doc }), {
    prazoMs: PRAZO_MS[doc],
    parametros: { doc },
  });
  return respostaCron(r);
});
