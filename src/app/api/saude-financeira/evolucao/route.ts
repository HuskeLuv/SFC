import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { getEvolucao } from '@/services/saudeFinanceira/saudeFinanceiraSnapshot';

/**
 * GET /api/saude-financeira/evolucao — série mensal dos snapshots de
 * indicadores (últimos 24 meses), do mais antigo ao mais recente. A série
 * nasce vazia e cresce a cada mês visitado (upsert lazy do GET principal).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const snapshots = await getEvolucao(targetUserId);
  return NextResponse.json({ snapshots });
});
