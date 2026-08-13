import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { buildSaudeFinanceira } from '@/services/saudeFinanceira/saudeFinanceiraServer';
import {
  computeTendencias,
  extractSnapshotData,
  getSnapshotAnterior,
  upsertSnapshotMesCorrente,
} from '@/services/saudeFinanceira/saudeFinanceiraSnapshot';

/**
 * GET /api/saude-financeira — diagnóstico completo de saúde financeira.
 *
 * Read-only para o caller, mas com um efeito colateral deliberado: cada
 * visita re-carimba (fire-and-forget) o snapshot do mês corrente, que
 * alimenta as setas de tendência ("vs último teste") e o gráfico de
 * evolução. Caso de uso original é o consultor acompanhando o cliente,
 * então o acesso personificado é logado.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);

  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/saude-financeira',
    'GET',
  );

  const now = new Date();
  const [saude, snapshotAnterior] = await Promise.all([
    buildSaudeFinanceira(targetUserId),
    getSnapshotAnterior(targetUserId, now),
  ]);

  const snapshotAtual = extractSnapshotData(saude.indicadores);
  const tendencias = computeTendencias(snapshotAtual, snapshotAnterior);
  void upsertSnapshotMesCorrente(targetUserId, snapshotAtual, now).catch(() => {
    // best-effort: falha na foto não pode derrubar o diagnóstico
  });

  return NextResponse.json({ ...saude, tendencias });
});
