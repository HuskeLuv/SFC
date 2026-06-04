/**
 * Garante, para cada posição de RV do usuário, uma linha de auditoria
 * (StockTransaction com `notes.operation.action='ajuste-corporativo'`,
 * price=0, total=0) por evento corporativo aplicável ocorrido APÓS a primeira
 * compra — e recomputa o Portfolio.
 *
 * IMPORTANTE: o ajuste de quantidade/preço médio NÃO é feito aqui via delta.
 * Ele é responsabilidade de `recalculatePortfolioFromTransactions`, que aplica
 * o FATOR multiplicativo no replay (robusto a edições). A linha de auditoria é
 * apenas informativa e é IGNORADA pelo recálculo. Ver `corporateActions.ts`.
 *
 * Tipos aplicados: DESDOBRAMENTO, GRUPAMENTO, BONIFICACAO. Demais são
 * ignorados (factor da BRAPI não é multiplicador simples de quantidade).
 *
 * Idempotência: cada evento gera no máximo uma linha de auditoria, detectada
 * por `notes.corporateActionId`. Re-runs só recomputam o Portfolio (no-op se
 * nada mudou).
 */
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  APPLICABLE_CORPORATE_ACTION_TYPES,
  CORPORATE_ACTION_NOTE_MARKER,
  computeCorporateActionAudit,
  type CorporateActionFactor,
} from './corporateActions';
import { recalculatePortfolioFromTransactions } from './portfolioRecalculation';

export interface ApplyCorporateActionsResult {
  scanned: number;
  applied: number;
  skipped: number;
  errors: number;
}

export async function applyCorporateActionsToUserPositions(
  userId: string,
): Promise<ApplyCorporateActionsResult> {
  const result: ApplyCorporateActionsResult = { scanned: 0, applied: 0, skipped: 0, errors: 0 };

  const portfolios = await prisma.portfolio.findMany({
    where: { userId, asset: { type: { in: ['stock', 'fii', 'bdr'] } } },
    include: { asset: { select: { id: true, symbol: true } } },
  });

  for (const p of portfolios) {
    if (!p.assetId || !p.asset?.symbol) continue;

    // Transações reais (sem linhas de auditoria), em ordem cronológica.
    const txs = await prisma.stockTransaction.findMany({
      where: {
        userId,
        assetId: p.assetId,
        type: { in: ['compra', 'venda'] },
        NOT: { notes: { contains: CORPORATE_ACTION_NOTE_MARKER } },
      },
      orderBy: { date: 'asc' },
      select: { date: true, type: true, quantity: true },
    });
    if (txs.length === 0) continue;

    const corporateActions: CorporateActionFactor[] = await prisma.assetCorporateAction.findMany({
      where: {
        symbol: p.asset.symbol,
        type: { in: Array.from(APPLICABLE_CORPORATE_ACTION_TYPES) },
      },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, type: true, factor: true },
    });
    if (corporateActions.length === 0) continue;

    // Quantidade antes/depois de cada evento (só os que incidem sobre papéis
    // efetivamente detidos — quantityBefore > 0).
    const audit = computeCorporateActionAudit(txs, corporateActions);
    for (const a of audit) {
      result.scanned++;
      if (a.quantityBefore <= 0) {
        // Evento anterior à primeira compra do usuário — não se aplica.
        result.skipped++;
        continue;
      }

      const existing = await prisma.stockTransaction.findFirst({
        where: {
          userId,
          assetId: p.assetId,
          notes: { contains: `"corporateActionId":"${a.id}"` },
        },
        select: { id: true },
      });
      if (existing) {
        result.skipped++;
        continue;
      }

      try {
        await prisma.stockTransaction.create({
          data: {
            userId,
            assetId: p.assetId,
            type: 'compra',
            // Delta informativo (exibido no histórico); o recálculo usa o fator.
            quantity: a.quantityAfter - a.quantityBefore,
            price: 0,
            total: 0,
            date: a.date,
            fees: 0,
            notes: JSON.stringify({
              operation: { action: 'ajuste-corporativo' },
              corporateActionId: a.id,
              corporateActionType: a.type,
              factor: a.factor,
              quantidadeAntes: a.quantityBefore,
              quantidadeDepois: a.quantityAfter,
            }),
          },
        });
        result.applied++;
      } catch (err) {
        logger.warn(`[applyCorporateActions] erro ao criar auditoria ${a.id}:`, err);
        result.errors++;
      }
    }

    // Recomputa o Portfolio aplicando os fatores (idempotente). É aqui que
    // quantity/avgPrice de fato se ajustam.
    try {
      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: p.assetId,
        portfolioId: p.id,
      });
    } catch (err) {
      logger.warn(`[applyCorporateActions] erro ao recalcular portfolio ${p.id}:`, err);
      result.errors++;
    }
  }

  return result;
}
