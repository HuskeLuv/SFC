/**
 * Aplica AssetCorporateAction (DESDOBRAMENTO/GRUPAMENTO/BONIFICACAO) à
 * quantidade atual do Portfolio quando a ação ocorreu APÓS a primeira compra
 * do usuário. Cria uma StockTransaction de ajuste (tipo='compra' com
 * `notes.operation.action='ajuste-corporativo'`, price=0, total=0) pra
 * rastreabilidade e pra que recalculatePortfolioFromTransactions reproduza
 * o mesmo resultado.
 *
 * Tipos suportados (factor é multiplicador da quantidade):
 *   - DESDOBRAMENTO (split): factor > 1 (ex.: 2.0 = 2 para 1)
 *   - BONIFICACAO: factor > 1 (ex.: 1.1 = 10% extras)
 *   - GRUPAMENTO (reverse split): 0 < factor < 1 (ex.: 0.01 = 1 para 100)
 *
 * NÃO aplicados (até decisão explícita do contexto):
 *   - CIS RED CAP (cisão/redução de capital): factor não é multiplicador
 *     simples de quantidade — depende do tipo de cisão.
 *   - Outros tipos não listados acima são ignorados (logged como warn).
 *
 * Idempotência: cada AssetCorporateAction gera uma StockTransaction com
 * `notes.corporateActionId=<id>`. Antes de aplicar, verifica se já existe
 * transação com esse id no notes. Re-runs são no-op.
 */
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

const APPLICABLE_TYPES = new Set(['DESDOBRAMENTO', 'BONIFICACAO', 'GRUPAMENTO']);

export interface ApplyCorporateActionsResult {
  scanned: number;
  applied: number;
  skipped: number;
  errors: number;
}

export async function applyCorporateActionsToUserPositions(
  userId: string,
): Promise<ApplyCorporateActionsResult> {
  const result: ApplyCorporateActionsResult = {
    scanned: 0,
    applied: 0,
    skipped: 0,
    errors: 0,
  };

  // Posições de ações/FIIs/BDRs do usuário com a primeira compra de cada.
  const portfolios = await prisma.portfolio.findMany({
    where: { userId, asset: { type: { in: ['stock', 'fii', 'bdr'] } } },
    include: { asset: { select: { id: true, symbol: true } } },
  });

  for (const p of portfolios) {
    if (!p.assetId || !p.asset?.symbol) continue;
    const firstBuy = await prisma.stockTransaction.findFirst({
      where: {
        userId,
        assetId: p.assetId,
        type: 'compra',
        notes: { not: { contains: '"corporateActionId"' } },
      },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    if (!firstBuy) continue;

    const actions = await prisma.assetCorporateAction.findMany({
      where: { symbol: p.asset.symbol, date: { gte: firstBuy.date } },
      orderBy: { date: 'asc' },
    });

    for (const action of actions) {
      result.scanned++;
      if (!APPLICABLE_TYPES.has(action.type)) {
        logger.warn(
          `[applyCorporateActions] tipo não suportado: ${action.type} factor=${action.factor} symbol=${action.symbol} — ignorado`,
        );
        result.skipped++;
        continue;
      }

      // Checa idempotência via notes da transação
      const existing = await prisma.stockTransaction.findFirst({
        where: {
          userId,
          assetId: p.assetId,
          notes: { contains: `"corporateActionId":"${action.id}"` },
        },
        select: { id: true },
      });
      if (existing) {
        result.skipped++;
        continue;
      }

      try {
        // Lê o portfolio atualizado (pode ter sido modificado por uma action
        // anterior no loop).
        const current = await prisma.portfolio.findUnique({
          where: { id: p.id },
          select: { quantity: true, totalInvested: true, avgPrice: true },
        });
        if (!current) continue;

        const newQty = current.quantity * action.factor;
        // avgPrice se ajusta inversamente — total investido permanece igual.
        const newAvg = newQty > 0 ? current.totalInvested / newQty : 0;

        await prisma.$transaction([
          prisma.portfolio.update({
            where: { id: p.id },
            data: { quantity: newQty, avgPrice: newAvg, lastUpdate: new Date() },
          }),
          prisma.stockTransaction.create({
            data: {
              userId,
              assetId: p.assetId,
              type: 'compra',
              quantity: newQty - current.quantity, // delta (positivo pra split/bonif, negativo pra grupamento)
              price: 0,
              total: 0,
              date: action.date,
              fees: 0,
              notes: JSON.stringify({
                operation: { action: 'ajuste-corporativo' },
                corporateActionId: action.id,
                corporateActionType: action.type,
                factor: action.factor,
                completeFactor: action.completeFactor ?? null,
                quantidadeAntes: current.quantity,
                quantidadeDepois: newQty,
              }),
            },
          }),
        ]);
        result.applied++;
      } catch (err) {
        logger.warn(`[applyCorporateActions] erro ao aplicar ${action.id}:`, err);
        result.errors++;
      }
    }
  }

  return result;
}
