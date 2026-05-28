import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { applyCorporateActionsToUserPositions } from '@/services/portfolio/applyCorporateActions';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Cron diário: aplica AssetCorporateAction (splits/grupamentos/bonificações)
 * recém-sincronizadas pela cron de dividends ao Portfolio dos usuários.
 *
 * Roda 7:25 UTC, depois de /api/cron/brapi-sync/dividends (7:20) que persiste
 * AssetCorporateAction e antes de fundamentals (7:30)/snapshots (8:00).
 *
 * Sem esta cron, novas bonificações catalogadas pela BRAPI ficavam só na
 * tabela AssetCorporateAction; Portfolio.quantity não era atualizada até
 * alguém rodar o script de backfill manualmente — exatamente o padrão A
 * (forward-only sem persistência da rotina) do postmortem v2.
 *
 * applyCorporateActionsToUserPositions é idempotente: cria StockTransaction
 * de ajuste com notes.corporateActionId; re-runs detectam pela presença do
 * id e pulam.
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

  const startTime = Date.now();
  logger.info('🏦 Aplicando corporate actions a Portfolios...');

  const userIds = await prisma.portfolio.findMany({
    where: { asset: { type: { in: ['stock', 'fii', 'bdr'] } } },
    select: { userId: true },
    distinct: ['userId'],
  });

  let totalScanned = 0;
  let totalApplied = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const errors: Array<{ userId: string; error: string }> = [];

  for (const { userId } of userIds) {
    try {
      const result = await applyCorporateActionsToUserPositions(userId);
      totalScanned += result.scanned;
      totalApplied += result.applied;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ userId, error: msg });
      logger.warn(`[apply-corporate-actions] erro user=${userId}:`, err);
    }
  }

  const duration = (Date.now() - startTime) / 1000;
  logger.info(
    `✅ Corp actions: ${userIds.length} users, ${totalScanned} scanned, ${totalApplied} applied, ${totalSkipped} skipped, ${totalErrors} erros em ${duration.toFixed(1)}s`,
  );

  return NextResponse.json({
    users: userIds.length,
    scanned: totalScanned,
    applied: totalApplied,
    skipped: totalSkipped,
    errors: totalErrors,
    errorsList: errors,
    duration,
  });
});
